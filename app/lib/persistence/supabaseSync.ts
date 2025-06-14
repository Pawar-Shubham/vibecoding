import { supabase } from '~/lib/supabase';
import type { ChatHistoryItem } from './useChatHistory';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { getAll, setMessages } from './db';

const logger = createScopedLogger('SupabaseSync');

export async function syncChatToSupabase(chat: ChatHistoryItem): Promise<void> {
  try {
    logger.info('Syncing chat to Supabase:', { chatId: chat.id });
    
    // First check if we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Try to refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logger.error('No valid session and refresh failed:', refreshError);
        throw new Error('Authentication required');
      }
    }

    // Add retry logic for network issues
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const { error } = await supabase
          .from('chat_history')
          .upsert({
            id: chat.id,
            user_id: chat.user_id,
            url_id: chat.urlId,
            description: chat.description,
            messages: chat.messages,
            timestamp: new Date().toISOString(),
            metadata: chat.metadata,
          }, {
            onConflict: 'id'
          });

        if (error) {
          throw error;
        }
        
        logger.info('Successfully synced chat to Supabase:', { chatId: chat.id });
        return;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error) {
    logger.error('Failed to sync chat to Supabase:', error);
    throw error;
  }
}

export async function syncChatsFromSupabase(userId: string): Promise<ChatHistoryItem[]> {
  try {
    logger.info('Fetching chats from Supabase for user:', { userId });
    
    // First check if we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Try to refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logger.error('No valid session and refresh failed:', refreshError);
        return [];
      }
    }

    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

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
    return [];
  }
}

export async function deleteChatFromSupabase(chatId: string): Promise<void> {
  try {
    logger.info('Deleting chat from Supabase:', { chatId });
    
    // First check if we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Try to refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logger.error('No valid session and refresh failed:', refreshError);
        throw new Error('Authentication required');
      }
    }

    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const { error } = await supabase
          .from('chat_history')
          .delete()
          .eq('id', chatId);

        if (error) {
          throw error;
        }
        
        logger.info('Successfully deleted chat from Supabase:', { chatId });
        return;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error) {
    logger.error('Failed to delete chat from Supabase:', error);
    throw error;
  }
}

export async function performInitialSync(db: IDBDatabase, userId: string): Promise<void> {
  try {
    logger.info('Performing initial sync with Supabase');
    
    // Get all chats from Supabase
    const supabaseChats = await syncChatsFromSupabase(userId);
    
    // Get all local chats
    const localChats = await getAll(db, userId);
    
    // Create a map of chat IDs to chats for easier lookup
    const supabaseChatsMap = new Map(supabaseChats.map(chat => [chat.id, chat]));
    const localChatsMap = new Map(localChats.map(chat => [chat.id, chat]));
    
    // Sync Supabase chats to local
    for (const supabaseChat of supabaseChats) {
      const localChat = localChatsMap.get(supabaseChat.id);
      
      // If chat doesn't exist locally or Supabase version is newer, save to local
      if (!localChat || new Date(supabaseChat.timestamp) > new Date(localChat.timestamp)) {
        await setMessages(
          db,
          supabaseChat.id,
          supabaseChat.messages,
          supabaseChat.user_id,
          supabaseChat.urlId,
          supabaseChat.description,
          supabaseChat.timestamp,
          supabaseChat.metadata
        );
      }
    }
    
    // Sync local chats to Supabase
    for (const localChat of localChats) {
      const supabaseChat = supabaseChatsMap.get(localChat.id);
      
      // If chat doesn't exist in Supabase or local version is newer, sync to Supabase
      if (!supabaseChat || new Date(localChat.timestamp) > new Date(supabaseChat.timestamp)) {
        await syncChatToSupabase(localChat);
      }
    }
    
    logger.info('Initial sync completed successfully');
  } catch (error) {
    logger.error('Failed to perform initial sync:', error);
    throw error;
  }
} 