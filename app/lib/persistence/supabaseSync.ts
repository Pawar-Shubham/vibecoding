import { supabase } from '~/lib/supabase';
import type { ChatHistoryItem } from './useChatHistory';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { getAll, setMessages } from './db';

const logger = createScopedLogger('SupabaseSync');

export async function syncChatToSupabase(chat: ChatHistoryItem): Promise<void> {
  // Skip sync if no network connection
  if (!navigator.onLine) {
    logger.warn('No network connection available, skipping sync');
    return;
  }

  try {
    logger.info('Syncing chat to Supabase:', { chatId: chat.id });
    
    // First check if we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      logger.warn('No valid session found, skipping sync');
      return;
    }

    // Add retry logic for network issues
    let retryCount = 0;
    const maxRetries = 5; // Increased from 3 to 5
    let lastError: Error | null = null;
    
    while (retryCount < maxRetries) {
      try {
        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 10000);
        });

        const syncPromise = supabase
          .from('chat_history')
          .upsert({
            id: chat.id,
            user_id: chat.user_id,
            url_id: chat.urlId,
            description: chat.description,
            messages: chat.messages,
            timestamp: chat.timestamp,
            metadata: chat.metadata,
            updated_at: new Date().toISOString(), // Add updated_at for better sync
          }, {
            onConflict: 'id'
          });

        const { error } = await Promise.race([syncPromise, timeoutPromise]);

        if (error) {
          if (error.message.includes('JWT') || error.message.includes('auth')) {
            logger.error('Authentication error during sync:', error);
            // Try to refresh the session
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              return; // Exit if we can't refresh the session
            }
            throw error; // Retry with refreshed session
          }
          throw error;
        }
        
        logger.info('Successfully synced chat to Supabase:', { chatId: chat.id });
        return; // Success - exit the retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000); // Increased max backoff to 15s
          logger.warn(`Sync attempt ${retryCount} failed, retrying in ${delay/1000}s...`, { error: lastError.message });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    // If we got here, all retries failed
    if (lastError) {
      throw lastError;
    }
  } catch (error) {
    logger.error('Failed to sync chat to Supabase:', error);
    
    // Only show toast for critical errors that aren't network/auth related
    // and when we've exhausted all retries
    if (error instanceof Error) {
      const isNetworkError = error.message.includes('network') || 
                          error.message.includes('timeout') ||
                          error.message.includes('failed to fetch') ||
                          error.message.includes('Request timeout');
      const isAuthError = error.message.includes('JWT') || 
                       error.message.includes('auth') ||
                       error.message.includes('unauthorized');
      
      if (!isNetworkError && !isAuthError) {
        // Show error only for critical failures
        toast.error('Failed to sync chat to cloud storage', {
          toastId: 'sync-error-' + chat.id, // Make toast ID unique per chat
          autoClose: 5000,
          position: 'bottom-right',
          pauseOnHover: true,
          hideProgressBar: false
        });
      }
    }
  }
}

export async function syncChatsFromSupabase(userId: string): Promise<ChatHistoryItem[]> {
  try {
    logger.info('Fetching chats from Supabase for user:', { userId });
    
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    logger.info('Successfully fetched chats from Supabase:', { count: data?.length });
    
    return data.map((item) => ({
      id: item.id,
      user_id: item.user_id,
      urlId: item.url_id,
      description: item.description,
      messages: item.messages,
      timestamp: item.timestamp,
      metadata: item.metadata,
    }));
  } catch (error) {
    logger.error('Failed to sync chats from Supabase:', error);
    toast.error('Failed to load chats from cloud storage');
    return [];
  }
}

export async function deleteChatFromSupabase(chatId: string): Promise<void> {
  try {
    logger.info('Deleting chat from Supabase:', { chatId });
    
    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('id', chatId);

    if (error) {
      logger.error('Failed to delete chat from Supabase:', error);
      throw error;
    }
    
    logger.info('Successfully deleted chat from Supabase:', { chatId });
  } catch (error) {
    logger.error('Failed to delete chat from Supabase:', error);
    throw error; // Re-throw the error but don't show a toast
  }
}

export async function performInitialSync(database: IDBDatabase, userId: string): Promise<void> {
  if (!navigator.onLine) {
    logger.warn('No network connection, skipping initial sync');
    return;
  }

  try {
    logger.info('Starting initial sync for user:', { userId });

    // Get chats from both sources
    const [cloudChats, localChats] = await Promise.all([
      syncChatsFromSupabase(userId),
      getAll(database, userId)
    ]);

    logger.info('Fetched chats:', { 
      cloudCount: cloudChats.length, 
      localCount: localChats.length 
    });

    // Sync cloud chats to local
    for (const cloudChat of cloudChats) {
      const localChat = localChats.find(chat => chat.id === cloudChat.id);
      
      // If cloud chat is newer or doesn't exist locally, save to IndexedDB
      if (!localChat || new Date(cloudChat.timestamp) > new Date(localChat.timestamp)) {
        logger.info('Syncing cloud chat to local:', { chatId: cloudChat.id });
        await setMessages(
          database,
          cloudChat.id,
          cloudChat.messages,
          userId,
          cloudChat.urlId,
          cloudChat.description,
          cloudChat.timestamp,
          cloudChat.metadata,
        );
      }
    }

    // Sync local chats to cloud
    const syncPromises = localChats.map(async (localChat) => {
      const cloudChat = cloudChats.find(chat => chat.id === localChat.id);
      
      // If local chat is newer or doesn't exist in cloud, sync to Supabase
      if (!cloudChat || new Date(localChat.timestamp) > new Date(cloudChat.timestamp)) {
        logger.info('Syncing local chat to cloud:', { chatId: localChat.id });
        try {
          await syncChatToSupabase(localChat);
        } catch (error) {
          // Log but don't fail the entire sync
          logger.error('Failed to sync individual chat:', { chatId: localChat.id, error });
        }
      }
    });

    // Wait for all syncs to complete but don't fail if some fail
    await Promise.allSettled(syncPromises);

    logger.info('Initial sync completed');
  } catch (error) {
    logger.error('Failed to perform initial sync:', error);
    // Only show error for critical failures
    if (error instanceof Error && 
        !error.message.includes('network') && 
        !error.message.includes('auth')) {
      toast.error('Failed to sync chat history', {
        toastId: 'initial-sync-error',
        autoClose: 5000
      });
    }
  }
} 