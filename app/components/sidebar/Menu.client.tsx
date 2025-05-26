import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { Button } from '~/components/ui/Button';
import { db, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory, migrateExistingChatsToUser } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import { authStore } from '~/lib/stores/auth';
import { useAuth } from '~/lib/hooks/useAuth';
import { useSettingsStore } from '~/lib/stores/settings';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    y: -20,
    transformOrigin: 'bottom left',
    scale: 0.95,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    y: 0,
    transformOrigin: 'bottom left',
    scale: 1,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent =
  | { type: 'delete'; item: ChatHistoryItem }
  | { type: 'bulkDelete'; items: ChatHistoryItem[] }
  | null;

function CurrentDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800/50">
      <div className="h-4 w-4 i-ph:clock opacity-80" />
      <div className="flex gap-2">
        <span>{dateTime.toLocaleDateString()}</span>
        <span>{dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

interface MenuProps {
  isLandingPage?: boolean;
}

const MenuComponent = ({ isLandingPage = false }: MenuProps) => {
  const { duplicateCurrentChat, exportChat } = useChatHistory();
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const profile = useStore(profileStore);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const { user } = useAuth();
  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
  });
  const [hasMigrated, setHasMigrated] = useState(false);

  const loadEntries = useCallback(() => {
    if (db && user?.id) {
      getAll(db, user.id)
        .then((list) => list.filter((item) => item.urlId && item.description))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, [user?.id]);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      if (!db) {
        throw new Error('Database not available');
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
        console.log('Removed snapshot for chat:', id);
      } catch (snapshotError) {
        console.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      // Delete the chat from the database
      await deleteById(db, id);
      console.log('Successfully deleted chat:', id);
    },
    [db],
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      console.log('Attempting to delete chat:', { id: item.id, description: item.description });

      deleteChat(item.id)
        .then(() => {
          toast.success('Chat deleted successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          loadEntries();

          if (chatId.get() === item.id) {
            console.log('Navigating away from deleted chat');
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          console.error('Failed to delete chat:', error);
          toast.error('Failed to delete conversation', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          loadEntries();
        });
    },
    [loadEntries, deleteChat],
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        console.log('Bulk delete skipped: No DB or no items to delete.');
        return;
      }

      console.log(`Starting bulk delete for ${itemsToDeleteIds.length} chats`, itemsToDeleteIds);

      let deletedCount = 0;
      const errors: string[] = [];
      const currentChatId = chatId.get();
      let shouldNavigate = false;

      for (const id of itemsToDeleteIds) {
        try {
          await deleteChat(id);
          deletedCount++;

          if (id === currentChatId) {
            shouldNavigate = true;
          }
        } catch (error) {
          console.error(`Error deleting chat ${id}:`, error);
          errors.push(id);
        }
      }

      if (errors.length === 0) {
        toast.success(`${deletedCount} chat${deletedCount === 1 ? '' : 's'} deleted successfully`);
      } else {
        toast.warning(`Deleted ${deletedCount} of ${itemsToDeleteIds.length} chats. ${errors.length} failed.`, {
          autoClose: 5000,
        });
      }

      await loadEntries();

      setSelectedItems([]);
      setSelectionMode(false);

      if (shouldNavigate) {
        console.log('Navigating away from deleted chat');
        window.location.pathname = '/';
      }
    },
    [deleteChat, loadEntries, db],
  );

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const newSelectedItems = prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      console.log('Selected items updated:', newSelectedItems);
      return newSelectedItems;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        const newSelectedItems = prev.filter((id) => !allFilteredIds.includes(id));
        console.log('Deselecting all filtered items. New selection:', newSelectedItems);
        return newSelectedItems;
      } else {
        const newSelectedItems = [...new Set([...prev, ...allFilteredIds])];
        console.log('Selecting all filtered items. New selection:', newSelectedItems);
        return newSelectedItems;
      }
    });
  }, [filteredList]);

  const setDialogContentWithLogging = useCallback((content: DialogContent) => {
    console.log('Setting dialog content:', content);
    setDialogContent(content);
  }, []);

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open, loadEntries]);

  useEffect(() => {
    if (!open && selectionMode) {
      console.log('Sidebar closed, preserving selection state');
    }
  }, [open, selectionMode]);

  const handleDuplicate = async (id: string) => {
    await duplicateCurrentChat(id);
    loadEntries(); // Reload the list after duplication
  };

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info('Select at least one chat to delete');
      return;
    }

    const selectedChats = list.filter((item) => selectedItems.includes(item.id));

    if (selectedChats.length === 0) {
      toast.error('Could not find selected chats');
      return;
    }

    setDialogContent({ type: 'bulkDelete', items: selectedChats });
  }, [selectedItems, list]);

  useEffect(() => {
    if (user?.id && !hasMigrated && db) {
      migrateExistingChatsToUser(db, user.id)
        .then(() => {
          setHasMigrated(true);
          console.log('Successfully migrated existing chats to user:', user.id);
        })
        .catch((error) => {
          console.error('Failed to migrate chats:', error);
        });
    }
  }, [user?.id, hasMigrated]);

  return (
    <>
      <motion.button
        onClick={() => setOpen(!open)}
        className={classNames(
          'flex items-center rounded-md p-1',
          'text-[#666] bg-transparent',
          'hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10',
          'transition-colors',
          { 'fixed bottom-4 left-4 z-[100]': isLandingPage, 'opacity-0': isLandingPage && open }
        )}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="i-ph:list text-2xl" />
      </motion.button>
      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        style={isLandingPage ? 
          { width: '380px', position: 'fixed', left: '1rem', bottom: '1rem', zIndex: 101 } :
          { width: '380px', position: 'fixed', left: '36%', transform: 'translateX(-50%)' }
        }
        className={classNames(
          'flex selection-accent flex-col side-menu',
          'min-h-[300px] max-h-[calc(100vh-180px)]',
          'bg-white dark:bg-gray-950',
          'shadow-2xl rounded-2xl',
          'text-sm overflow-hidden',
          { 'top-[calc(var(--header-height)_+_0.5rem)]': !isLandingPage },
          'z-sidebar',
          'origin-bottom-left'
        )}
      >
        <div className="h-14 flex items-center justify-between px-5 bg-gray-50/80 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800/50 rounded-t-2xl">
          <div className="text-gray-900 dark:text-white font-medium text-base">Menu</div>
          <div className="flex items-center gap-3">
            {profile?.avatar && (
              <div className="flex items-center justify-center w-8 h-8 overflow-hidden bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-500 rounded-full shrink-0 ring-2 ring-purple-100 dark:ring-purple-900">
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'User'}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="sync"
                />
              </div>
            )}
            <motion.button
              onClick={() => setOpen(false)}
              className={classNames(
                'flex items-center rounded-md p-1',
                'text-[#666] bg-transparent',
                'hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10',
                'transition-colors'
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="i-ph:x text-xl" />
            </motion.button>
          </div>
        </div>
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          <div className="p-5 space-y-4">
            <div className="relative w-full">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 dark:text-gray-500">
                <div className="i-ph:magnifying-glass text-[16px]" />
              </div>
              <input
                className="w-full bg-gray-50 dark:bg-gray-900 pl-9 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 border border-gray-200 dark:border-gray-800 transition-all duration-200"
                type="search"
                placeholder="Search Chats ..."
                onChange={handleSearchChange}
                aria-label="Search chats"
              />
            </div>

            {selectionMode && (
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectionMode(false)}>
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    {selectedItems.length === filteredList.length ? 'Deselect all' : 'Select all'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDeleteClick}
                    disabled={selectedItems.length === 0}
                  >
                    Delete selected
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 w-full">
              <motion.a
                href="/"
                className="w-1/2 flex gap-2 items-center justify-center bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 rounded-xl px-4 py-2.5 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="inline-block i-ph:plus-circle h-5 w-5" />
                <span className="text-sm font-medium">New Chat</span>
              </motion.a>
              <motion.button
                onClick={() => setSelectionMode(!selectionMode)}
                className="w-1/2 flex gap-2 items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl px-4 py-2.5 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="inline-block i-ph:trash h-5 w-5" />
                <span className="text-sm font-medium">Delete Chat</span>
              </motion.button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="flex items-center justify-between text-sm px-5 py-2">
              <div className="font-medium text-gray-900 dark:text-gray-100">Your Chats</div>
            </div>
            <div className="px-3 pb-3 hover:pr-2 transition-all duration-200">
              {filteredList.length === 0 && (
                <div className="px-4 text-gray-500 dark:text-gray-400 text-sm">
                  {list.length === 0 ? 'No previous conversations' : 'No matches found'}
                </div>
              )}
              {binDates(filteredList).map(({ category, items }) => (
                <div key={category} className="mt-2 first:mt-0 space-y-1">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-1 bg-white dark:bg-gray-950 px-4 py-1">
                    {category}
                  </div>
                  <div className="space-y-0.5 pr-1">
                    {items.map((item) => (
                      <HistoryItem
                        key={item.id}
                        item={item}
                        exportChat={exportChat}
                        onDelete={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          console.log('Delete triggered for item:', item);
                          setDialogContentWithLogging({ type: 'delete', item });
                        }}
                        onDuplicate={() => handleDuplicate(item.id)}
                        selectionMode={selectionMode}
                        isSelected={selectedItems.includes(item.id)}
                        onToggleSelection={toggleItemSelection}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 px-5 py-4 bg-gray-50/80 dark:bg-gray-900/50 backdrop-blur-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {user?.email}
            </div>
            <button
              onClick={() => {
                const settingsStore = useSettingsStore.getState();
                settingsStore.openSettings();
              }}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="i-ph:gear text-lg text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </motion.div>

      <DialogRoot open={dialogContent !== null}>
        {dialogContent?.type === 'delete' && (
          <>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-4">
              <DialogButton type="secondary" onClick={() => setDialogContent(null)}>
                Cancel
              </DialogButton>
              <DialogButton
                type="danger"
                onClick={(event) => {
                  event.preventDefault();
                  if (dialogContent.item) {
                    deleteItem(event, dialogContent.item);
                  }
                  setDialogContent(null);
                }}
              >
                Delete
              </DialogButton>
            </div>
          </>
        )}
        {dialogContent?.type === 'bulkDelete' && (
          <>
            <DialogTitle>Delete multiple chats</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {dialogContent.items.length} chat
              {dialogContent.items.length === 1 ? '' : 's'}? This action cannot be undone.
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-4">
              <DialogButton type="secondary" onClick={() => setDialogContent(null)}>
                Cancel
              </DialogButton>
              <DialogButton
                type="danger"
                onClick={(event) => {
                  event.preventDefault();
                  if (dialogContent.items) {
                    deleteSelectedItems(dialogContent.items.map((item) => item.id));
                  }
                  setDialogContent(null);
                }}
              >
                Delete
              </DialogButton>
            </div>
          </>
        )}
      </DialogRoot>
    </>
  );
};

// Wrapper component that handles auth check
export const Menu = ({ isLandingPage = false }: MenuProps) => {
  const { user } = useAuth();
  const [hasMigrated, setHasMigrated] = useState(false);
  
  useEffect(() => {
    if (user?.id && !hasMigrated && db) {
      migrateExistingChatsToUser(db, user.id)
        .then(() => {
          setHasMigrated(true);
          console.log('Successfully migrated existing chats to user:', user.id);
        })
        .catch((error) => {
          console.error('Failed to migrate chats:', error);
        });
    }
  }, [user?.id, hasMigrated]);
  
  if (!user) {
    return null;
  }

  return <MenuComponent isLandingPage={isLandingPage} />;
};
