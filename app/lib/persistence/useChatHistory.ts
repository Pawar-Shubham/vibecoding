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
  const { id: mixedId } = useLoaderData<{ id?: string }>();
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
              logger.warn('Chat not found:', mixedId);
              setReady(true);
              navigate('/');
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
            navigate('/');
          });
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

    // Prevent multiple sync attempts within a short time period unless chat ID changed
    const now = Date.now();
    if (now - lastSyncAttempt < 60000 && mixedId === previousMixedId) { // Increase cooldown to 60 seconds
      logger.info('Skipping sync due to cooldown period');
      return;
    }
    setLastSyncAttempt(now);

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

        // Check for network connectivity
        if (!navigator.onLine) {
          logger.warn('No network connection, skipping cloud sync');
          
          // Load chat from local database even when offline
          if (mixedId && mounted) {
            const chat = await getMessages(database, mixedId);
            if (chat && chat.user_id === user.id) {
              chatId.set(chat.id);
              setUrlId(chat.urlId);
              setInitialMessages(chat.messages);
              description.set(chat.description);
              chatMetadata.set(chat.metadata);

              const snapshot = await getSnapshot(database, chat.id);
              if (snapshot && mounted) {
                workbenchStore.setDocuments(snapshot.files);
              }
            }
          }
          
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
          logger.warn('No valid session found, skipping sync');
          
          // Still load chat from local database
          if (mixedId && mounted) {
            const chat = await getMessages(database, mixedId);
            if (chat) {
              chatId.set(chat.id);
              setUrlId(chat.urlId);
              setInitialMessages(chat.messages);
              description.set(chat.description);
              chatMetadata.set(chat.metadata);

              const snapshot = await getSnapshot(database, chat.id);
              if (snapshot && mounted) {
                workbenchStore.setDocuments(snapshot.files);
              }
            }
          }
          
          setReady(true);
          return;
        }

        // Add a small delay before syncing to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 500));

        // Perform initial sync between IndexedDB and Supabase
        if (mounted) {
          await performInitialSync(database, user.id);
        }

        // Load specific chat if ID is provided
        if (mixedId && mounted) {
          logger.info('Loading chat:', mixedId);
          const chat = await getMessages(database, mixedId);
          if (!chat) {
            logger.warn('Chat not found:', mixedId);
            setReady(true);
            navigate('/');
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

          const snapshot = await getSnapshot(database, chat.id);
          if (snapshot && mounted) {
            workbenchStore.setDocuments(snapshot.files);
          }
          logger.info('Chat loaded successfully:', mixedId);
        } else if (!mixedId && mounted) {
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
        console.error('Failed to sync chats:', error);
        // Only show error if it's not a network or auth error
        if (mounted && !(error instanceof Error && 
            (error.message.includes('network') || 
             error.message.includes('JWT') ||
             error.message.includes('auth')))) {
          toast.error('Failed to sync chats with cloud storage', { 
            toastId: 'initial-sync-error',
            autoClose: 5000,
            pauseOnHover: true
          });
        }
        if (mounted) {
          setReady(true);
        }
      } finally {
        if (mounted) {
          setIsSyncing(false);
        }
      }
    };

    // Start sync immediately for better performance
    loadAndSync();

    // Cleanup function
    return () => {
      mounted = false;
      if (syncTimeout) {
        clearTimeout(syncTimeout);
      }
    };
  }, [mixedId, navigate, user?.id, loading, initialized, database]);

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
        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
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
        await setMessages(
          database,
          finalChatId,
          allMessages,
          user.id,
          urlId,
          description.get(),
          timestamp,
          chatMetadata.get(),
        );

        // Then try to sync to cloud if we have network
        if (navigator.onLine) {
          try {
            await syncChatToSupabase({
              id: finalChatId,
              user_id: user.id,
              urlId,
              description: description.get(),
              messages: allMessages,
              timestamp,
              metadata: chatMetadata.get(),
            });
          } catch (error) {
            // Log but don't show error to user since local save succeeded
            logger.error('Failed to sync to cloud but local save succeeded:', error);
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
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
