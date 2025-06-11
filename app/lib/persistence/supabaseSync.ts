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
    const maxRetries = 5;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
      try {
        // Check if chat exists
        const { data: existingChat } = await supabase
          .from('chat_history')
          .select('updated_at')
          .eq('id', chat.id)
          .single();

        if (existingChat) {
          // Update existing chat
          const { error: updateError } = await supabase
            .from('chat_history')
            .update({
              messages: chat.messages,
              description: chat.description,
              metadata: chat.metadata,
              updated_at: new Date().toISOString()
            })
            .eq('id', chat.id)
            .eq('user_id', chat.user_id);

          if (updateError) throw updateError;
        } else {
          // Insert new chat
          const { error: insertError } = await supabase
            .from('chat_history')
            .insert({
              id: chat.id,
              user_id: chat.user_id,
              url_id: chat.urlId,
              description: chat.description,
              messages: chat.messages,
              metadata: chat.metadata,
              timestamp: chat.timestamp || new Date().toISOString()
            });

          if (insertError) throw insertError;
        }

        // If we get here, sync was successful
        logger.info('Successfully synced chat to Supabase:', { chatId: chat.id });
        return;
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        // Only retry on network errors or rate limits
        if (error instanceof Error) {
          const isRetryableError = error.message.includes('network') || 
                                error.message.includes('timeout') ||
                                error.message.includes('rate limit') ||
                                error.message.includes('connection');
          
          if (!isRetryableError) {
            throw error; // Don't retry on non-network errors
          }
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    // If we got here, all retries failed
    if (lastError) {
      throw lastError;
    }
  } catch (error) {
    logger.error('Failed to sync chat to Supabase:', error);
    throw error;
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