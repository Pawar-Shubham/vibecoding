import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  ensureDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  type IChatMetadata,
  getAll,
} from './db';
import { syncChatToSupabase, syncChatsFromSupabase, deleteChatFromSupabase, performInitialSync } from './supabaseSync';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';
import { useAuth } from '~/lib/hooks/useAuth';
import { supabase } from '~/lib/supabase';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatHistory');

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
  user_id: string;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

// Initialize database
export const db = persistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);
export function useChatHistory() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<{ id?: string }>();
  const { id: mixedId } = loaderData || {};
  const [searchParams] = useSearchParams();
  const { user, loading, initialized } = useAuth();

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [database, setDatabase] = useState<IDBDatabase | undefined>(db);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncAttempt, setLastSyncAttempt] = useState<number>(0);
  const [previousMixedId, setPreviousMixedId] = useState<string | undefined>();

  // Define restoreSnapshot first, before it's used
  const restoreSnapshot = async (id: string, snapshot?: Snapshot) => {
    const container = await webcontainer;
    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    Object.entries(validSnapshot.files).forEach(async ([key, value]) => {
      if (key.startsWith(container.workdir)) {
        key = key.replace(container.workdir, '');
      }

      if (value?.type === 'folder') {
        await container.fs.mkdir(key, { recursive: true });
      }
    });
    Object.entries(validSnapshot.files).forEach(async ([key, value]) => {
      if (value?.type === 'file') {
        if (key.startsWith(container.workdir)) {
          key = key.replace(container.workdir, '');
        }

        await container.fs.writeFile(key, value.content, { encoding: value.isBinary ? undefined : 'utf8' });
      }
    });
  };

  // Ensure database connection
  useEffect(() => {
    if (persistenceEnabled) {
      ensureDatabase().then(setDatabase);
    }
  }, []);

  // Reset ready state when mixedId changes to force reload
  useEffect(() => {
    if (mixedId !== previousMixedId) {
      logger.info('Chat ID changed, resetting state', { from: previousMixedId, to: mixedId });
      setReady(false);
      setInitialMessages([]);
      setUrlId(undefined);
      chatId.set(undefined);
      description.set(undefined);
      chatMetadata.set(undefined);
      setPreviousMixedId(mixedId);

      // Reset workbench state
      workbenchStore.resetAllFileModifications();
      workbenchStore.setDocuments({});
      workbenchStore.clearAlert();
      workbenchStore.clearSupabaseAlert();
      workbenchStore.clearDeployAlert();

      // Immediately load the new chat if we have a database connection
      if (database && user?.id && mixedId) {
        getMessages(database, mixedId)
          .then(async chat => {
            if (!chat) {
              logger.warn('Chat not found locally:', mixedId);
              // Don't immediately navigate - give sync process a chance to find the chat
              setReady(true);
              return;
            }

            if (chat.user_id !== user.id) {
              setReady(true);
              toast.error('You do not have access to this chat', { 
                toastId: 'access-error',
                autoClose: 5000
              });
              navigate('/');
              return;
            }

            chatId.set(chat.id);
            setUrlId(chat.urlId);
            setInitialMessages(chat.messages);
            description.set(chat.description);
            chatMetadata.set(chat.metadata);

            try {
              // Load and apply snapshot
              const snapshot = await getSnapshot(database, chat.id);
              if (snapshot) {
                // First clear any existing files
                workbenchStore.setDocuments({});
                
                // Then apply the new snapshot
                await restoreSnapshot(chat.id, snapshot);
                
                // Finally update the workbench state with the snapshot files
                workbenchStore.setDocuments(snapshot.files);
                
                logger.info('Snapshot restored successfully for chat:', chat.id);
              }
            } catch (error) {
              logger.error('Failed to restore snapshot:', error);
              toast.error('Failed to restore code state');
            }

            setReady(true);
            logger.info('Chat loaded successfully:', mixedId);
          })
          .catch(error => {
            logger.error('Failed to load chat:', error);
            setReady(true);
            toast.error('Failed to load chat');
            // Don't navigate away immediately - let the sync process handle it
          });
      } else {
        // If no mixedId, no database, or no user, set ready immediately
        // This handles cases like homepage or when conditions aren't met
        logger.info('Setting ready state immediately', { mixedId, hasDatabase: !!database, hasUser: !!user?.id });
        setReady(true);
      }
    }
  }, [mixedId, previousMixedId, database, user?.id, navigate, restoreSnapshot]);

  // Initial load and sync effect
  useEffect(() => {
    // Don't proceed if auth is not initialized or still loading
    if (loading || !initialized) {
      return;
    }

    // Don't proceed if database is not available when needed
    if (!database && user?.id && persistenceEnabled) {
      const error = new Error('Chat persistence is unavailable');
      console.error('Database initialization failed');
      logStore.logError('Chat persistence initialization failed', error);
      toast.error('Chat persistence is unavailable', { toastId: 'db-error' });
      setReady(true);
      return;
    }

    // If no user, just set ready state
    if (!user?.id) {
      setReady(true);
      return;
    }

    let syncTimeout: NodeJS.Timeout | undefined;
    let mounted = true;

    const loadAndSync = async () => {
      // Don't start another sync if one is already in progress unless chat ID changed
      if (isSyncing && mixedId === previousMixedId) {
        logger.info('Sync already in progress, skipping');
        return;
      }

      setIsSyncing(true);
      try {
        if (!database) {
          setInitialMessages([]);
          setReady(true);
          return;
        }

        // Always try to load from local first for faster response
        if (mixedId && mounted) {
          const localChat = await getMessages(database, mixedId);
          if (localChat && localChat.user_id === user.id) {
            chatId.set(localChat.id);
            setUrlId(localChat.urlId);
            setInitialMessages(localChat.messages);
            description.set(localChat.description);
            chatMetadata.set(localChat.metadata);

            const snapshot = await getSnapshot(database, localChat.id);
            if (snapshot && mounted) {
              workbenchStore.setDocuments(snapshot.files);
            }
          }
        }

        // Check for network connectivity
        if (!navigator.onLine) {
          logger.warn('No network connection, using local data only');
          setReady(true);
          
          // Set up a listener to try sync when connection is restored
          const handleOnline = () => {
            if (mounted) {
              loadAndSync();
            }
          };
          window.addEventListener('online', handleOnline);
          return () => {
            window.removeEventListener('online', handleOnline);
          };
        }

        // Check if we have a valid session before syncing
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          logger.warn('No valid session found, using local data only');
          setReady(true);
          return;
        }

        // Add a small delay before syncing to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 500));

        // Perform initial sync between IndexedDB and Supabase
        if (mounted) {
          try {
            await performInitialSync(database, user.id);
            
            // After sync, reload the current chat from local DB to get any updates
            if (mixedId) {
              const updatedChat = await getMessages(database, mixedId);
              if (updatedChat && updatedChat.user_id === user.id && mounted) {
                chatId.set(updatedChat.id);
                setUrlId(updatedChat.urlId);
                setInitialMessages(updatedChat.messages);
                description.set(updatedChat.description);
                chatMetadata.set(updatedChat.metadata);

                const snapshot = await getSnapshot(database, updatedChat.id);
                if (snapshot && mounted) {
                  workbenchStore.setDocuments(snapshot.files);
                }
              } else if (!updatedChat && mounted) {
                // Chat not found locally, try to fetch from Supabase one more time
                logger.warn('Chat not found locally after sync, checking Supabase:', mixedId);
                try {
                  const supabaseChats = await syncChatsFromSupabase(user.id);
                  const supabaseChat = supabaseChats.find(chat => chat.id === mixedId || chat.urlId === mixedId);
                  
                  if (supabaseChat) {
                    // Chat exists in Supabase but not locally - save it locally
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
                    
                    // Now load it
                    chatId.set(supabaseChat.id);
                    setUrlId(supabaseChat.urlId);
                    setInitialMessages(supabaseChat.messages);
                    description.set(supabaseChat.description);
                    chatMetadata.set(supabaseChat.metadata);
                    
                    logger.info('Successfully recovered chat from Supabase:', supabaseChat.id);
                  } else {
                    logger.warn('Chat not found in Supabase either:', mixedId);
                    // Instead of navigating away, show a helpful message and let user decide
                    toast.error(`Chat not found. This chat may have been deleted or you may not have access to it.`, {
                      toastId: 'chat-not-found',
                      autoClose: false,
                      closeOnClick: true
                    });
                    // Set ready to true so the UI can show the "chat not found" fallback
                    setReady(true);
                  }
                } catch (recoveryError) {
                  logger.error('Failed to recover chat from Supabase:', recoveryError);
                  toast.error('Unable to load chat. Please check your connection and try again.', {
                    toastId: 'recovery-error',
                    autoClose: 5000
                  });
                  setReady(true);
                }
              }
            }
          } catch (error) {
            logger.error('Failed to perform initial sync:', error);
            // Continue with local data if sync fails, but still try to load the specific chat
            if (mixedId && mounted) {
              try {
                const localChat = await getMessages(database, mixedId);
                if (localChat && localChat.user_id === user.id) {
                  chatId.set(localChat.id);
                  setUrlId(localChat.urlId);
                  setInitialMessages(localChat.messages);
                  description.set(localChat.description);
                  chatMetadata.set(localChat.metadata);
                  
                  const snapshot = await getSnapshot(database, localChat.id);
                  if (snapshot) {
                    workbenchStore.setDocuments(snapshot.files);
                  }
                } else {
                  toast.error('Chat not found locally. Please check your internet connection.', {
                    toastId: 'local-chat-error',
                    autoClose: 5000
                  });
                  setReady(true);
                }
              } catch (localError) {
                logger.error('Failed to load chat locally:', localError);
                toast.error('Error loading chat from local storage.', {
                  toastId: 'local-error',
                  autoClose: 5000
                });
                setReady(true);
              }
            }
          }
        }

        if (!mixedId && mounted) {
          // Clear everything when navigating to home
          chatId.set(undefined);
          setUrlId(undefined);
          setInitialMessages([]);
          description.set(undefined);
          chatMetadata.set(undefined);
          workbenchStore.setDocuments({});
        }

        if (mounted) {
          setReady(true);
        }
      } catch (error) {
        logger.error('Failed to load/sync chats:', error);
        if (mounted) {
          setReady(true);
          // Only show error for critical failures
          if (!(error instanceof Error && 
              (error.message.includes('network') || 
               error.message.includes('JWT') ||
               error.message.includes('auth')))) {
            toast.error('Failed to load chat history', { 
              toastId: 'load-error',
              autoClose: 5000,
              pauseOnHover: true
            });
          }
        }
      } finally {
        if (mounted) {
          setIsSyncing(false);
        }
      }
    };

    // Start sync immediately for better performance
    loadAndSync();

    // Set up periodic sync to catch any changes
    const syncInterval = setInterval(() => {
      if (mounted && navigator.onLine) {
        loadAndSync();
      }
    }, 60000); // Sync every minute if online

    // Cleanup function
    return () => {
      mounted = false;
      if (syncTimeout) {
        clearTimeout(syncTimeout);
      }
      clearInterval(syncInterval);
    };
  }, [mixedId, navigate, user?.id, loading, initialized, database, isSyncing, previousMixedId]);

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatId.get();

      if (!id || !database) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      try {
        await setSnapshot(database, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [database],
  );

  return {
    ready: !mixedId || ready,
    initialMessages,
    isSyncing,
    updateChatMetadata: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!database || !id || !user?.id) {
        return;
      }

      try {
        await setMessages(database, id, initialMessages, user.id, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
        await syncChatToSupabase({
          id,
          user_id: user.id,
          urlId,
          description: description.get(),
          messages: initialMessages,
          timestamp: new Date().toISOString(),
          metadata,
        });
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!database || messages.length === 0 || !user?.id) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      if (!urlId && firstArtifact?.id) {
        const urlId = await getUrlId(database, firstArtifact.id);
        _urlId = urlId;
        navigateChat(urlId);
        setUrlId(urlId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(database);
        logger.info('Generated new chat ID:', { chatId: nextId, urlId: urlId });
        chatId.set(nextId);

        if (!urlId) {
          // Generate a proper URL ID and navigate to it
          const newUrlId = await getUrlId(database, nextId);
          logger.info('Generated new URL ID for chat:', { chatId: nextId, urlId: newUrlId });
          setUrlId(newUrlId);
          _urlId = newUrlId;
          navigateChat(newUrlId);
        }
      }

      const finalChatId = chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');
        return;
      }

      const timestamp = new Date().toISOString();
      const allMessages = [...archivedMessages, ...messages];

      try {
        // First save locally
        logger.info('Saving chat messages:', { 
          chatId: finalChatId, 
          urlId: _urlId, 
          messageCount: allMessages.length,
          description: description.get(),
          timestamp 
        });
        
        await setMessages(
          database,
          finalChatId,
          allMessages,
          user.id,
          _urlId, // Use _urlId to ensure we have the correct URL ID
          description.get(),
          timestamp,
          chatMetadata.get(),
        );
        
        logger.info('Successfully saved chat messages locally:', { chatId: finalChatId });

        // Then try to sync to cloud if we have network
        if (navigator.onLine) {
          try {
            await syncChatToSupabase({
              id: finalChatId,
              user_id: user.id,
              urlId: _urlId, // Use _urlId instead of urlId to ensure we have the correct URL ID
              description: description.get(),
              messages: allMessages,
              timestamp,
              metadata: chatMetadata.get(),
            });
            logger.info('Successfully synced chat to Supabase:', { chatId: finalChatId });
          } catch (error) {
            // Enhanced error logging to understand the issue
            logger.error('Failed to sync to cloud but local save succeeded:', { 
              error: error instanceof Error ? error.message : String(error), 
              chatId: finalChatId,
              userId: user.id,
              urlId: _urlId,
              description: description.get(),
              messageCount: allMessages.length
            });
            
            // Show a more detailed error to help debug
            console.error('Sync error details:', error);
            
            // Determine the type of error and show appropriate message
            if (error instanceof Error) {
              const isNetworkError = error.message.includes('network') || 
                                  error.message.includes('timeout') ||
                                  error.message.includes('failed to fetch') ||
                                  error.message.includes('Request timeout');
              
              const isAuthError = error.message.includes('JWT') || 
                               error.message.includes('auth') ||
                               error.message.includes('Authentication') ||
                               error.message.includes('policy');

              if (isAuthError) {
                toast.error('Authentication required for cloud sync. Please sign in again.', {
                  toastId: 'auth-error-' + finalChatId,
                  autoClose: 8000,
                });
              } else if (isNetworkError) {
                toast.error('Network error during sync. Chat saved locally.', {
                  toastId: 'network-error-' + finalChatId,
                  autoClose: 5000,
                });
              } else {
                // Show the actual error message for debugging
                toast.error(`Sync failed: ${error.message}. Chat saved locally.`, {
                  toastId: 'sync-error-' + finalChatId,
                  autoClose: 10000,
                });
              }
            } else {
              toast.error('Failed to sync chat to cloud storage. Chat saved locally.', {
                toastId: 'sync-error-' + finalChatId,
                autoClose: 8000,
              });
            }
          }
        } else {
          logger.info('Offline - skipping cloud sync, local save only');
        }
      } catch (error) {
        console.error('Failed to save messages:', error);
        toast.error('Failed to save chat messages', {
          toastId: 'save-error-' + finalChatId,
          autoClose: 5000
        });
      }
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!database || (!mixedId && !listItemId) || !user?.id) {
        return;
      }

      try {
        const chat = await getMessages(database, mixedId || listItemId);
        if (!chat || chat.user_id !== user.id) {
          toast.error('You do not have access to this chat');
          return;
        }

        const newId = await duplicateChat(database, mixedId || listItemId, user.id);
        
        // Also duplicate in Supabase
        const newChat = await getMessages(database, newId);
        if (newChat) {
          await syncChatToSupabase(newChat);
        }

        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!database || !user?.id) {
        return;
      }

      try {
        const newId = await createChatFromMessages(database, description, messages, user.id, metadata);
        
        // Also import to Supabase
        const newChat = await getMessages(database, newId);
        if (newChat) {
          await syncChatToSupabase(newChat);
        }

        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!database || !id) {
        return;
      }

      const chat = await getMessages(database, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  
  logger.info('Navigating to chat:', { urlId: nextId });
  
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
