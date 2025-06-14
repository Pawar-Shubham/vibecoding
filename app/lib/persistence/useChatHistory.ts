import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { atom, type WritableAtom } from 'nanostores';
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

// Create atoms with proper typing
export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

// Create a type for the chat store
type ChatStore = {
  chatId: WritableAtom<string | undefined>;
  description: WritableAtom<string | undefined>;
  chatMetadata: WritableAtom<IChatMetadata | undefined>;
};

// Create a store instance
const chatStore: ChatStore = {
  chatId,
  description,
  chatMetadata,
};

export function useChatHistory() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [previousMixedId, setPreviousMixedId] = useState<string | undefined>();
  const [database, setDatabase] = useState<IDBDatabase | null>(null);
  const mounted = useRef(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mixedId = searchParams.get('id');

  // Reset ready state when mixedId changes to force reload
  useEffect(() => {
    if (mixedId !== previousMixedId) {
      logger.info('Chat ID changed, resetting state', { from: previousMixedId, to: mixedId });
      setReady(false);
      setInitialMessages([]);
      setUrlId(undefined);
      chatStore.chatId.set(undefined);
      chatStore.description.set(undefined);
      chatStore.chatMetadata.set(undefined);
      setPreviousMixedId(mixedId || undefined);

      // Reset workbench state
      workbenchStore.resetAllFileModifications();
      workbenchStore.setDocuments({});
      workbenchStore.clearAlert();
      workbenchStore.clearSupabaseAlert();
      workbenchStore.clearDeployAlert();

      // Immediately load the new chat if we have a database connection
      if (database && user?.id && mixedId) {
        loadChat(mixedId);
      }
    }
  }, [mixedId, previousMixedId, database, user?.id]);

  const loadChat = async (chatId: string) => {
    if (!database || !user) return;

    try {
      // First try to get from Supabase
      const supabaseChats = await syncChatsFromSupabase(user.id);
      const supabaseChat = supabaseChats.find(chat => chat.id === chatId);

      if (supabaseChat) {
        // Update local database with Supabase data
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

        // Update UI state
        chatStore.chatId.set(supabaseChat.id);
        setUrlId(supabaseChat.urlId);
        setInitialMessages(supabaseChat.messages);
        chatStore.description.set(supabaseChat.description);
        chatStore.chatMetadata.set(supabaseChat.metadata);

        // Load snapshot if exists
        const snapshot = await getSnapshot(database, supabaseChat.id);
        if (snapshot) {
          workbenchStore.setDocuments(snapshot.files);
        }
      } else {
        // Try to get from local database
        const localChat = await getMessages(database, chatId);
        if (localChat && localChat.user_id === user.id) {
          chatStore.chatId.set(localChat.id);
          setUrlId(localChat.urlId);
          setInitialMessages(localChat.messages);
          chatStore.description.set(localChat.description);
          chatStore.chatMetadata.set(localChat.metadata);

          // Load snapshot if exists
          const snapshot = await getSnapshot(database, localChat.id);
          if (snapshot) {
            workbenchStore.setDocuments(snapshot.files);
          }

          // Sync to Supabase
          await syncChatToSupabase(localChat);
        } else {
          logger.warn('Chat not found or unauthorized:', chatId);
          navigate('/');
          return;
        }
      }
    } catch (error) {
      logger.error('Failed to load chat:', error);
      toast.error('Failed to load chat');
      navigate('/');
      return;
    }
  };

  useEffect(() => {
    mounted.current = true;

    const loadAndSync = async () => {
      if (!user?.id) {
        if (mounted.current) {
          setReady(true);
        }
        return;
      }

      try {
        setIsSyncing(true);

        // Open/ensure database
        const db = await openDatabase();
        if (!db) {
          throw new Error('Failed to open database');
        }
        
        // Initialize database schema
        const dbInstance = await ensureDatabase();
        if (!dbInstance) {
          throw new Error('Failed to initialize database schema');
        }
        
        if (mounted.current) {
          setDatabase(db);
        }

        // Perform initial sync between IndexedDB and Supabase
        if (mounted.current && db) {
          try {
            await performInitialSync(db, user.id);
            
            // After sync, load the current chat if needed
            if (mixedId) {
              await loadChat(mixedId);
            }
          } catch (error) {
            logger.error('Failed to perform initial sync:', error);
            // Continue with local data if sync fails
          }
        }

        if (!mixedId && mounted.current) {
          // Clear everything when navigating to home
          chatStore.chatId.set(undefined);
          setUrlId(undefined);
          setInitialMessages([]);
          chatStore.description.set(undefined);
          chatStore.chatMetadata.set(undefined);
          workbenchStore.setDocuments({});
        }

        if (mounted.current) {
          setReady(true);
        }
      } catch (error) {
        logger.error('Failed to initialize chat history:', error);
        if (mounted.current) {
          setReady(true);
        }
      } finally {
        if (mounted.current) {
          setIsSyncing(false);
        }
      }
    };

    loadAndSync();

    return () => {
      mounted.current = false;
    };
  }, [user?.id, mixedId]);

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatStore.chatId.get();

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
      const id = chatStore.chatId.get();

      if (!database || !id || !user?.id) {
        return;
      }

      try {
        await setMessages(database, id, initialMessages, user.id, urlId, chatStore.description.get(), undefined, metadata);
        chatStore.chatMetadata.set(metadata);
        await syncChatToSupabase({
          id,
          user_id: user.id,
          urlId,
          description: chatStore.description.get(),
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

      if (!chatStore.description.get() && firstArtifact?.title) {
        chatStore.description.set(firstArtifact?.title);
      }

      if (initialMessages.length === 0 && !chatStore.chatId.get()) {
        const nextId = await getNextId(database);
        chatStore.chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      const finalChatId = chatStore.chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');
        return;
      }

      const timestamp = new Date().toISOString();
      const allMessages = [...initialMessages, ...messages];

      try {
        // First save locally
        await setMessages(
          database,
          finalChatId,
          allMessages,
          user.id,
          urlId,
          chatStore.description.get(),
          timestamp,
          chatStore.chatMetadata.get(),
        );

        // Then try to sync to cloud if we have network
        if (navigator.onLine) {
          try {
            await syncChatToSupabase({
              id: finalChatId,
              user_id: user.id,
              urlId,
              description: chatStore.description.get(),
              messages: allMessages,
              timestamp,
              metadata: chatStore.chatMetadata.get(),
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
