import { supabase } from '~/lib/supabase';
import type { ChatHistoryItem } from './useChatHistory';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { getAll, setMessages } from './db';

const logger = createScopedLogger('SupabaseSync');

export async function syncChatToSupabase(chat: ChatHistoryItem): Promise<void> {
  try {
    logger.info('Syncing chat to Supabase:', { chatId: chat.id });
    
    const { error } = await supabase
      .from('chat_history')
      .upsert({
        id: chat.id,
        user_id: chat.user_id,
        url_id: chat.urlId,
        description: chat.description,
        messages: chat.messages,
        timestamp: chat.timestamp,
        metadata: chat.metadata,
      }, {
        onConflict: 'id'
      });

    if (error) {
      throw error;
    }
    
    logger.info('Successfully synced chat to Supabase:', { chatId: chat.id });
  } catch (error) {
    logger.error('Failed to sync chat to Supabase:', error);
    // Don't show toast for network errors to avoid spamming the user
    if (!(error instanceof Error && error.message.includes('network'))) {
      toast.error('Failed to sync chat to cloud storage');
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
      throw error;
    }
    
    logger.info('Successfully deleted chat from Supabase:', { chatId });
  } catch (error) {
    logger.error('Failed to delete chat from Supabase:', error);
    toast.error('Failed to delete chat from cloud storage');
  }
}

export async function performInitialSync(database: IDBDatabase, userId: string): Promise<void> {
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
    for (const localChat of localChats) {
      const cloudChat = cloudChats.find(chat => chat.id === localChat.id);
      
      // If local chat is newer or doesn't exist in cloud, sync to Supabase
      if (!cloudChat || new Date(localChat.timestamp) > new Date(cloudChat.timestamp)) {
        logger.info('Syncing local chat to cloud:', { chatId: localChat.id });
        await syncChatToSupabase(localChat);
      }
    }

    logger.info('Initial sync completed successfully');
  } catch (error) {
    logger.error('Failed to perform initial sync:', error);
    toast.error('Failed to sync chat history');
  }
} 