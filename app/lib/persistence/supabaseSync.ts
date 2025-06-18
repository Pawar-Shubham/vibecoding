import { supabase } from '~/lib/supabase';
import type { ChatHistoryItem } from './useChatHistory';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { getAll, setMessages } from './db';

const logger = createScopedLogger('SupabaseSync');

// Test function to validate Supabase connection and table access
export async function validateSupabaseAccess(): Promise<{ success: boolean; error?: string }> {
  try {
    // Check authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return { success: false, error: `Authentication failed: ${sessionError?.message || 'No session'}` };
    }

    // Test basic table access
    const { data, error } = await supabase
      .from('chat_history')
      .select('id')
      .limit(1);

    if (error) {
      return { success: false, error: `Table access failed: ${error.message}` };
    }

    logger.info('Supabase validation successful:', { userId: session.user.id });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Validation failed: ${errorMessage}` };
  }
}

export async function syncChatToSupabase(chat: ChatHistoryItem): Promise<void> {
  // Skip sync if no network connection
  if (!navigator.onLine) {
    logger.warn('No network connection available, skipping sync');
    return;
  }

  try {
    logger.info('Syncing chat to Supabase:', { 
      chatId: chat.id, 
      urlId: chat.urlId,
      userId: chat.user_id,
      description: chat.description,
      messageCount: chat.messages?.length
    });
    
    // First validate Supabase access
    const validation = await validateSupabaseAccess();
    if (!validation.success) {
      throw new Error(validation.error);
    }

    // Get current session for user verification
    const { data: { session } } = await supabase.auth.getSession();
    
    // Verify the user_id matches the session
    if (chat.user_id !== session!.user.id) {
      logger.error('User ID mismatch - potential security issue:', { 
        chatUserId: chat.user_id, 
        sessionUserId: session!.user.id 
      });
      throw new Error('User authentication mismatch');
    }

    // Validate required fields
    if (!chat.id || !chat.user_id || !chat.messages) {
      logger.error('Invalid chat data:', { 
        hasId: !!chat.id,
        hasUserId: !!chat.user_id,
        hasMessages: !!chat.messages,
        messageCount: chat.messages?.length 
      });
      throw new Error('Invalid chat data: missing required fields');
    }

    // Add retry logic for network issues
    let retryCount = 0;
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    while (retryCount < maxRetries) {
      try {
        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 15000);
        });

        // Sanitize messages to handle Unicode escape sequences that cause PostgreSQL JSONB issues
        const sanitizeMessages = (messages: any[]) => {
          return messages.map(message => {
            if (typeof message.content === 'string') {
              // Clean up problematic Unicode characters and escape sequences
              let cleanContent = message.content
                // Remove null bytes which are not allowed in PostgreSQL
                .replace(/\u0000/g, '')
                // Replace problematic Unicode escape sequences
                .replace(/\\u[0-9a-fA-F]{4}/g, (match: string) => {
                  try {
                    // Try to convert Unicode escape to actual character
                    return JSON.parse('"' + match + '"');
                  } catch {
                    // If conversion fails, remove the escape sequence
                    return '';
                  }
                })
                // Remove other control characters that might cause issues
                .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
              
              return {
                ...message,
                content: cleanContent
              };
            }
            
            return message;
          });
        };

        // Prepare data for Supabase - ensure proper format
        const chatData = {
          id: String(chat.id), // Ensure id is TEXT
          user_id: chat.user_id, // This should already be UUID
          url_id: chat.urlId || null, // Handle undefined urlId
          description: chat.description || null, // Handle undefined description
          messages: sanitizeMessages(chat.messages), // Sanitized JSONB
          timestamp: chat.timestamp,
          metadata: chat.metadata || null, // Handle undefined metadata
          updated_at: new Date().toISOString(),
        };

        logger.info('Prepared chat data for sync:', {
          id: chatData.id,
          userId: chatData.user_id,
          urlId: chatData.url_id,
          hasDescription: !!chatData.description,
          messageCount: chatData.messages.length,
          originalMessageCount: chat.messages.length
        });

        // Additional validation: Try to JSON stringify the entire payload
        try {
          JSON.stringify(chatData);
        } catch (jsonError) {
          logger.error('JSON serialization test failed:', { error: jsonError, chatId: chat.id });
          throw new Error(`Data serialization failed: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
        }

        const syncPromise = supabase
          .from('chat_history')
          .upsert(chatData, {
            onConflict: 'id'
          });

        const { error } = await Promise.race([syncPromise, timeoutPromise]) as any;

        if (error) {
          // Enhanced error logging
          logger.error('Supabase sync error:', { 
            error: error.message || error,
            code: error.code,
            details: error.details,
            hint: error.hint,
            chatId: chat.id,
            userId: chat.user_id
          });

          // Handle specific error types
          if (error.message.includes('JWT') || error.message.includes('auth')) {
            logger.error('Authentication error during sync:', error);
            // Try to refresh the session
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              logger.error('Failed to refresh session:', refreshError);
              throw new Error(`Authentication refresh failed: ${refreshError.message}`);
            }
            throw error; // Retry with refreshed session
          }

          // Handle RLS policy errors
          if (error.message.includes('policy') || error.code === '42501') {
            throw new Error(`Access denied: Row Level Security policy prevented this operation. User: ${chat.user_id}`);
          }

          // Handle other specific errors
          if (error.code === '23505') {
            throw new Error('Chat already exists with this ID');
          }

          throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
        }
        
        logger.info('Successfully synced chat to Supabase:', { chatId: chat.id });
        return; // Success - exit the retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
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
    
    // Re-throw the error so the caller can handle it appropriately
    throw error;
  }
}

export async function syncChatsFromSupabase(userId: string): Promise<ChatHistoryItem[]> {
  try {
    logger.info('Fetching chats from Supabase for user:', { userId });
    
    // First validate Supabase access
    const validation = await validateSupabaseAccess();
    if (!validation.success) {
      logger.warn('Supabase validation failed:', validation.error);
      return [];
    }

    // Ensure we have a valid session before querying
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== userId) {
      logger.warn('Invalid session for user:', { userId });
      return [];
    }
    
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      // Handle RLS policy errors gracefully
      if (error.message.includes('policy')) {
        logger.warn('RLS policy denied access - user may not be properly authenticated');
        return [];
      }
      throw error;
    }

    logger.info('Successfully fetched chats from Supabase:', { count: data?.length });
    
    return (data || []).map((item) => ({
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
    
    // Don't show error toast for auth issues
    if (error instanceof Error && !error.message.includes('auth') && !error.message.includes('JWT')) {
      toast.error('Failed to load chats from cloud storage');
    }
    return [];
  }
}

export async function deleteChatFromSupabase(chatId: string): Promise<void> {
  try {
    logger.info('Deleting chat from Supabase:', { chatId });
    
    // Verify we have a valid session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      logger.warn('No valid session for deletion:', sessionError);
      throw new Error('Authentication required for deletion');
    }
    
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
    throw error;
  }
}

export async function performInitialSync(database: IDBDatabase, userId: string): Promise<void> {
  try {
    logger.info('Starting initial sync for user:', { userId });
    
    // Verify authentication before syncing
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user || session.user.id !== userId) {
      logger.warn('Invalid session during initial sync:', { userId, sessionError });
      return;
    }

    // Fetch all chats from Supabase
    const supabaseChats = await syncChatsFromSupabase(userId);
    logger.info('Fetched chats from Supabase:', { count: supabaseChats.length });

    // Fetch all local chats
    const localChats = await getAll(database, userId);
    logger.info('Fetched local chats:', { count: localChats.length });

    // Create maps for easier comparison
    const supabaseChatsMap = new Map(supabaseChats.map(chat => [chat.id, chat]));
    const localChatsMap = new Map(localChats.map(chat => [chat.id, chat]));

    // Track sync operations
    let syncedFromSupabase = 0;
    let syncedToSupabase = 0;
    let updated = 0;

    // Sync chats from Supabase to local (chats that exist in Supabase but not locally)
    for (const supabaseChat of supabaseChats) {
      const localChat = localChatsMap.get(supabaseChat.id);
      
      if (!localChat) {
        // Chat exists in Supabase but not locally - save to local
        await setMessages(
          database,
          supabaseChat.id,
          supabaseChat.messages,
          supabaseChat.user_id,
          supabaseChat.urlId,
          supabaseChat.description,
          supabaseChat.timestamp,
          supabaseChat.metadata
        );
        syncedFromSupabase++;
        logger.info('Synced chat from Supabase to local:', { chatId: supabaseChat.id });
      } else {
        // Chat exists in both - check if update needed
        const supabaseUpdated = new Date(supabaseChat.timestamp).getTime();
        const localUpdated = new Date(localChat.timestamp).getTime();
        
        if (supabaseUpdated > localUpdated) {
          // Supabase version is newer - update local
          await setMessages(
            database,
            supabaseChat.id,
            supabaseChat.messages,
            supabaseChat.user_id,
            supabaseChat.urlId,
            supabaseChat.description,
            supabaseChat.timestamp,
            supabaseChat.metadata
          );
          updated++;
          logger.info('Updated local chat from Supabase:', { chatId: supabaseChat.id });
        }
      }
    }

    // Sync chats from local to Supabase (chats that exist locally but not in Supabase)
    for (const localChat of localChats) {
      const supabaseChat = supabaseChatsMap.get(localChat.id);
      
      if (!supabaseChat && localChat.user_id === userId) {
        // Chat exists locally but not in Supabase - sync to Supabase
        try {
          await syncChatToSupabase(localChat);
          syncedToSupabase++;
          logger.info('Synced chat from local to Supabase:', { chatId: localChat.id });
        } catch (error) {
          logger.error('Failed to sync local chat to Supabase:', { chatId: localChat.id, error });
        }
      }
    }

    logger.info('Initial sync completed:', {
      syncedFromSupabase,
      syncedToSupabase,
      updated,
      totalSupabase: supabaseChats.length,
      totalLocal: localChats.length
    });

  } catch (error) {
    logger.error('Failed to perform initial sync:', error);
    
    // Only show error for non-auth failures
    if (error instanceof Error && 
        !error.message.includes('network') && 
        !error.message.includes('auth') &&
        !error.message.includes('JWT')) {
      toast.error('Failed to sync chat history', {
        toastId: 'initial-sync-error',
        autoClose: 5000
      });
    }
  }
}

// Force sync all chats for user (used when switching users or refreshing)
export async function forceSyncAllChats(database: IDBDatabase, userId: string): Promise<ChatHistoryItem[]> {
  try {
    logger.info('Force syncing all chats for user:', { userId });
    
    // Perform initial sync first
    await performInitialSync(database, userId);
    
    // Then fetch all synced chats from local database
    const allChats = await getAll(database, userId);
    
    logger.info('Force sync completed:', { count: allChats.length });
    return allChats;
  } catch (error) {
    logger.error('Failed to force sync chats:', error);
    return [];
  }
} 