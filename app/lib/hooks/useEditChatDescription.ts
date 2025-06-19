import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  chatId as chatIdStore,
  db,
  description as descriptionStore,
  getMessages,
  updateChatDescription,
} from '~/lib/persistence';
import { syncChatToSupabase } from '~/lib/persistence/supabaseSync';
import { useAuth } from '~/lib/hooks/useAuth';

interface EditChatDescriptionOptions {
  initialDescription?: string;
  customChatId?: string;
  syncWithGlobalStore?: boolean;
  onSuccess?: () => void;
}

type EditChatDescriptionHook = {
  editing: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: () => Promise<void>;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => Promise<void>;
  currentDescription: string;
  toggleEditMode: () => void;
};

/**
 * Hook to manage the state and behavior for editing chat descriptions.
 *
 * Offers functions to:
 * - Switch between edit and view modes.
 * - Manage input changes, blur, and form submission events.
 * - Save updates to IndexedDB and optionally to the global application state.
 *
 * @param {Object} options
 * @param {string} options.initialDescription - The current chat description.
 * @param {string} options.customChatId - Optional ID for updating the description via the sidebar.
 * @param {boolean} options.syncWithGlobalStore - Flag to indicate global description store synchronization.
 * @returns {EditChatDescriptionHook} Methods and state for managing description edits.
 */
export function useEditChatDescription({
  initialDescription = descriptionStore.get()!,
  customChatId,
  syncWithGlobalStore,
  onSuccess,
}: EditChatDescriptionOptions): EditChatDescriptionHook {
  const chatIdFromStore = useStore(chatIdStore);
  const [editing, setEditing] = useState(false);
  const [currentDescription, setCurrentDescription] = useState(initialDescription);

  const [chatId, setChatId] = useState<string>();

  useEffect(() => {
    setChatId(customChatId || chatIdFromStore);
  }, [customChatId, chatIdFromStore]);
  useEffect(() => {
    setCurrentDescription(initialDescription);
  }, [initialDescription]);

  const toggleEditMode = useCallback(() => setEditing((prev) => !prev), []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentDescription(e.target.value);
  }, []);

  const fetchLatestDescription = useCallback(async () => {
    if (!db || !chatId) {
      return initialDescription;
    }

    try {
      const chat = await getMessages(db, chatId);
      return chat?.description || initialDescription;
    } catch (error) {
      console.error('Failed to fetch latest description:', error);
      return initialDescription;
    }
  }, [db, chatId, initialDescription]);

  const handleBlur = useCallback(async () => {
    const latestDescription = await fetchLatestDescription();
    setCurrentDescription(latestDescription);
    toggleEditMode();
  }, [fetchLatestDescription, toggleEditMode]);

  const isValidDescription = useCallback((desc: string): boolean => {
    const trimmedDesc = desc.trim();

    if (trimmedDesc === initialDescription) {
      toggleEditMode();
      return false; // No change, skip validation
    }

    const lengthValid = trimmedDesc.length > 0 && trimmedDesc.length <= 100;

    // Allow letters, numbers, spaces, and common punctuation but exclude characters that could cause issues
    const characterValid = /^[a-zA-Z0-9\s\-_.,!?()[\]{}'"]+$/.test(trimmedDesc);

    if (!lengthValid) {
      toast.error('Description must be between 1 and 100 characters.');
      return false;
    }

    if (!characterValid) {
      toast.error('Description can only contain letters, numbers, spaces, and basic punctuation.');
      return false;
    }

    return true;
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!isValidDescription(currentDescription)) {
        return;
      }

      try {
        if (!db) {
          toast.error('Chat persistence is not available');
          return;
        }

        if (!chatId) {
          toast.error('Chat Id is not available');
          return;
        }

        // Update local database first
        await updateChatDescription(db, chatId, currentDescription);

        if (syncWithGlobalStore) {
          descriptionStore.set(currentDescription);
        }

        // Get updated chat data and sync to Supabase
        const updatedChat = await getMessages(db, chatId);
        if (updatedChat && navigator.onLine) {
          try {
            // Validate that the chat has a user_id and it matches current session
            if (!updatedChat.user_id) {
              console.warn('Chat has no user_id, skipping Supabase sync');
              toast.warning('Description updated locally but could not sync to cloud storage (missing user ID)');
            } else {
              await syncChatToSupabase(updatedChat);
            }
          } catch (syncError) {
            console.error('Failed to sync updated description to Supabase:', syncError);
            // Don't fail the entire operation if Supabase sync fails
            if (syncError instanceof Error) {
              if (syncError.message.includes('User authentication mismatch')) {
                toast.warning('Description updated locally but could not sync to cloud storage (authentication issue)');
              } else {
                toast.warning('Description updated locally but failed to sync to cloud storage');
              }
            } else {
              toast.warning('Description updated locally but failed to sync to cloud storage');
            }
          }
        }

        toast.success('Chat description updated successfully');
        
        // Call onSuccess callback if provided (for sidebar refresh)
        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        toast.error('Failed to update chat description: ' + (error as Error).message);
      }

      toggleEditMode();
    },
    [currentDescription, db, chatId, initialDescription, customChatId, onSuccess],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        await handleBlur();
      }
    },
    [handleBlur],
  );

  return {
    editing,
    handleChange,
    handleBlur,
    handleSubmit,
    handleKeyDown,
    currentDescription,
    toggleEditMode,
  };
}
