import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import type { ChatHistoryItem } from './useChatHistory';
import type { Snapshot } from './types'; // Import Snapshot type
import { deleteChatFromSupabase } from './supabaseSync';

export interface IChatMetadata {
  gitUrl: string;
  gitBranch?: string;
  netlifySiteId?: string;
}

const logger = createScopedLogger('ChatHistory');

let dbInstance: IDBDatabase | undefined;

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  // If we already have a database instance, return it
  if (dbInstance) {
    return dbInstance;
  }

  if (typeof indexedDB === 'undefined') {
    console.error('indexedDB is not available in this environment.');
    return undefined;
  }

  console.log('Attempting to open IndexedDB database...');

  return new Promise((resolve) => {
    try {
      // Increment version to 5 to force upgrade and remove urlId unique constraint
      const request = indexedDB.open('boltHistory', 5);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        console.log('Database upgrade needed. Current version:', event.oldVersion);
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        try {
          // If upgrading from version 4, we need to recreate the chats store without the unique urlId constraint
          if (oldVersion <= 4 && db.objectStoreNames.contains('chats')) {
            console.log('Removing chats store to rebuild without unique urlId constraint...');
            db.deleteObjectStore('chats');
          }

          // Create stores if they don't exist
          if (!db.objectStoreNames.contains('chats')) {
            console.log('Creating chats store...');
            const store = db.createObjectStore('chats', { keyPath: 'id' });
            store.createIndex('id', 'id', { unique: true });
            store.createIndex('urlId', 'urlId', { unique: false }); // Remove unique constraint
            store.createIndex('user_id', 'user_id', { unique: false });
            // Create a compound index for urlId + user_id if we need uniqueness per user
            store.createIndex('urlId_user_id', ['urlId', 'user_id'], { unique: false });
          }

          if (!db.objectStoreNames.contains('snapshots')) {
            console.log('Creating snapshots store...');
            db.createObjectStore('snapshots', { keyPath: 'chatId' });
          }

          // Always ensure the user_id index exists
          const store = db.transaction('chats', 'readwrite').objectStore('chats');
          if (!store.indexNames.contains('user_id')) {
            console.log('Adding user_id index...');
            store.createIndex('user_id', 'user_id', { unique: false });
          }

          // If upgrading from version 3, we need to ensure all existing records have a user_id
          if (oldVersion === 3) {
            console.log('Migrating existing records to include user_id...');
            const transaction = db.transaction('chats', 'readwrite');
            const store = transaction.objectStore('chats');
            const request = store.openCursor();

            request.onsuccess = () => {
              const cursor = request.result;
              if (cursor) {
                const chat = cursor.value;
                if (!chat.user_id) {
                  chat.user_id = 'migrated';
                  cursor.update(chat);
                }
                cursor.continue();
              }
            };
          }
        } catch (error) {
          console.error('Error during database upgrade:', error);
          logger.error(error);
        }
      };

      request.onsuccess = (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('Successfully opened database:', db.name, 'version:', db.version);
        
        // Store the database instance
        dbInstance = db;
        
        // Handle connection loss
        db.onversionchange = () => {
          db.close();
          dbInstance = undefined;
          console.log('Database connection closed due to version change');
        };
        
        resolve(db);
      };

      request.onerror = (event: Event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        console.error('Failed to open database:', error);
        logger.error(error);
        resolve(undefined);
      };

      request.onblocked = (event: Event) => {
        console.error('Database opening blocked. Please close other tabs with this site open.');
        resolve(undefined);
      };
    } catch (error) {
      console.error('Error creating database connection:', error);
      logger.error(error);
      resolve(undefined);
    }
  });
}

// Add a function to check database connection
export async function ensureDatabase(): Promise<IDBDatabase | undefined> {
  if (!dbInstance) {
    return openDatabase();
  }
  return dbInstance;
}

export async function getAll(db: IDBDatabase, userId: string): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('user_id');
    const request = index.getAll(userId);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  userId: string,
  urlId?: string,
  description?: string,
  timestamp?: string,
  metadata?: IChatMetadata,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    if (timestamp && isNaN(Date.parse(timestamp))) {
      reject(new Error('Invalid timestamp'));
      return;
    }

    const request = store.put({
      id,
      messages,
      urlId,
      description,
      timestamp: timestamp ?? new Date().toISOString(),
      metadata,
      user_id: userId,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return (await getMessagesById(db, id)) || (await getMessagesByUrlId(db, id));
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  logger.info('Starting chat deletion process:', { id });
  
  // First, try to delete from Supabase to ensure it's removed from cloud
  try {
    await deleteChatFromSupabase(id);
    logger.info('Successfully deleted chat from Supabase:', { id });
  } catch (supabaseError) {
    // Log error but continue with local deletion
    logger.error('Failed to delete chat from Supabase, continuing with local deletion:', { id, error: supabaseError });
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats', 'snapshots'], 'readwrite');
    const chatStore = transaction.objectStore('chats');
    const snapshotStore = transaction.objectStore('snapshots');

    let chatDeleted = false;
    let snapshotDeleted = false;

    const checkCompletion = () => {
      if (chatDeleted && snapshotDeleted) {
        logger.info('Successfully completed local deletion:', { id });
        resolve();
      }
    };

    // Delete from chat store
    const deleteChatRequest = chatStore.delete(id);
    deleteChatRequest.onsuccess = () => {
      logger.info('Deleted chat from local chat store:', { id });
      chatDeleted = true;
      checkCompletion();
    };
    deleteChatRequest.onerror = () => {
      logger.error('Failed to delete chat from local chat store:', { id, error: deleteChatRequest.error });
      reject(deleteChatRequest.error);
    };

    // Delete from snapshot store
    const deleteSnapshotRequest = snapshotStore.delete(id);
    deleteSnapshotRequest.onsuccess = () => {
      logger.info('Deleted snapshot from local storage:', { id });
      snapshotDeleted = true;
      checkCompletion();
    };
    deleteSnapshotRequest.onerror = (event) => {
      if ((event.target as IDBRequest).error?.name === 'NotFoundError') {
        // Snapshot doesn't exist, that's okay
        logger.info('Snapshot not found (already deleted):', { id });
        snapshotDeleted = true;
        checkCompletion();
      } else {
        logger.error('Failed to delete snapshot from local storage:', { id, error: deleteSnapshotRequest.error });
        reject(deleteSnapshotRequest.error);
      }
    };

    // Clean up any related localStorage items
    try {
      localStorage.removeItem(`snapshot:${id}`);
      localStorage.removeItem(`chat:${id}`);
      logger.info('Cleaned up localStorage items for chat:', { id });
    } catch (error) {
      logger.warn('Failed to clean up localStorage items for chat:', { id, error });
    }

    transaction.onerror = () => {
      logger.error('Transaction error during deletion:', { id, error: transaction.error });
      reject(transaction.error);
    };
  });
}

export async function getNextId(db: IDBDatabase): Promise<string> {
  // Generate a truly unique ID using timestamp + random string
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const uniqueId = `${timestamp}-${random}`;
  
  // Verify this ID doesn't already exist (very unlikely but just to be safe)
  try {
    const existing = await getMessagesById(db, uniqueId);
    if (existing) {
      // If it somehow exists, recurse to generate another
      return getNextId(db);
    }
  } catch {
    // ID doesn't exist, which is what we want
  }
  
  return uniqueId;
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  // Generate a unique URL ID using timestamp and random string for better uniqueness
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const baseId = `chat-${timestamp}-${random}`;
  
  // Get existing URL IDs to ensure uniqueness
  const idList = await getUrlIds(db);
  
  if (!idList.includes(baseId)) {
    return baseId;
  }
  
  // In the very unlikely case of collision, add an incrementing number
  let i = 2;
  while (idList.includes(`${baseId}-${i}`)) {
    i++;
  }
  
  return `${baseId}-${i}`;
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function forkChat(db: IDBDatabase, chatId: string, messageId: string): Promise<string> {
  const chat = await getMessages(db, chatId);

  if (!chat) {
    throw new Error('Chat not found');
  }

  // Find the index of the message to fork at
  const messageIndex = chat.messages.findIndex((msg) => msg.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  // Get messages up to and including the selected message
  const messages = chat.messages.slice(0, messageIndex + 1);

  return createChatFromMessages(db, chat.description ? `${chat.description} (fork)` : 'Forked chat', messages);
}

export async function duplicateChat(db: IDBDatabase, id: string, userId: string): Promise<string> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  return createChatFromMessages(db, `${chat.description || 'Chat'} (copy)`, chat.messages, userId, chat.metadata);
}

export async function createChatFromMessages(
  db: IDBDatabase,
  description: string,
  messages: Message[],
  userId: string,
  metadata?: IChatMetadata,
): Promise<string> {
  const newId = await getNextId(db);
  const newUrlId = await getUrlId(db, newId);

  await setMessages(
    db,
    newId,
    messages,
    userId,
    newUrlId,
    description,
    undefined,
    metadata,
  );

  return newUrlId;
}

export async function updateChatDescription(db: IDBDatabase, id: string, description: string): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  if (!description.trim()) {
    throw new Error('Description cannot be empty');
  }

  await setMessages(db, id, chat.messages, chat.userId, chat.urlId, description, chat.timestamp, chat.metadata);
}

export async function updateChatMetadata(
  db: IDBDatabase,
  id: string,
  metadata: IChatMetadata | undefined,
): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  await setMessages(db, id, chat.messages, chat.userId, chat.urlId, chat.description, chat.timestamp, metadata);
}

export async function getSnapshot(db: IDBDatabase, chatId: string): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readonly');
    const store = transaction.objectStore('snapshots');
    const request = store.get(chatId);

    request.onsuccess = () => resolve(request.result?.snapshot as Snapshot | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function setSnapshot(db: IDBDatabase, chatId: string, snapshot: Snapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.put({ chatId, snapshot });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSnapshot(db: IDBDatabase, chatId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.delete(chatId);

    request.onsuccess = () => resolve();

    request.onerror = (event) => {
      if ((event.target as IDBRequest).error?.name === 'NotFoundError') {
        resolve();
      } else {
        reject(request.error);
      }
    };
  });
}

export async function migrateExistingChatsToUser(db: IDBDatabase, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      
      if (cursor) {
        const chat = cursor.value;
        if (!chat.user_id) {
          chat.user_id = userId;
          cursor.update(chat);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}
