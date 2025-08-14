import { motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ClientOnly } from "remix-utils/client-only";
import {
  Dialog,
  DialogButton,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "~/components/ui/Dialog";
import { ThemeSwitch } from "~/components/ui/ThemeSwitch";
import { Button } from "~/components/ui/Button";
import {
  db,
  deleteById,
  getAll,
  chatId,
  type ChatHistoryItem,
  useChatHistory,
  migrateExistingChatsToUser,
} from "~/lib/persistence";
import {
  deleteChatFromSupabase,
  forceSyncAllChats,
} from "~/lib/persistence/supabaseSync";
import { cubicEasingFn } from "~/utils/easings";
import { HistoryItem } from "./HistoryItem";
import { binDates } from "./date-binning";
import { useSearchFilter } from "~/lib/hooks/useSearchFilter";
import { classNames } from "~/utils/classNames";
import { useStore } from "@nanostores/react";
import { profileStore } from "~/lib/stores/profile";
import { authStore } from "~/lib/stores/auth";
import { useAuth } from "~/lib/hooks/useAuth";
import { useSettingsStore } from "~/lib/stores/settings";
import { signOut } from "~/lib/supabase";
import { ControlPanel } from "~/components/@settings/core/ControlPanel";
import { sidebarStore } from "~/lib/stores/sidebar";
import { chatStore } from "~/lib/stores/chat";
import { streamingState } from "~/lib/stores/streaming";
// Use window events to communicate with root navigation loading
const startNavigationLoading = () => {
  window.dispatchEvent(new CustomEvent("start-navigation-loading"));
};

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: "hidden",
    x: "-100%",
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: "initial",
    x: "0%",
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent =
  | { type: "delete"; item: ChatHistoryItem }
  | { type: "bulkDelete"; items: ChatHistoryItem[] }
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
        <span>
          {dateTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
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
  const isSidebarOpen = useStore(sidebarStore);
  const chat = useStore(chatStore);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const profile = useStore(profileStore);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const { user } = useAuth();
  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ["description"],
  });
  const [hasMigrated, setHasMigrated] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();
  const [isLoading, setIsLoading] = useState(false);
  const settingsStore = useSettingsStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadEntries = useCallback(async () => {
    if (db && user?.id) {
      try {
        // First perform sync with Supabase to ensure we have the latest data
        await forceSyncAllChats(db, user.id);

        // Then load all chats from local database
        const allChats = await getAll(db, user.id);
        const filteredChats = allChats.filter(
          (item) => item.urlId && item.description
        );
        setList(filteredChats);
      } catch (error) {
        console.error("Error loading chat entries:", error);
        // Fallback to just loading from local if sync fails
        try {
          const localChats = await getAll(db, user.id);
          const filteredChats = localChats.filter(
            (item) => item.urlId && item.description
          );
          setList(filteredChats);
        } catch (localError) {
          toast.error("Failed to load chats");
        }
      }
    }
  }, [db, user?.id]);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      if (!db) {
        throw new Error("Database not available");
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
        console.log("Removed snapshot for chat:", id);
      } catch (snapshotError) {
        console.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      try {
        // Delete the chat from both local database and Supabase
        await deleteById(db, id);
        console.log("Successfully deleted chat:", id);
      } catch (error) {
        console.error("Error deleting chat:", error);
        throw error; // Re-throw to be caught by the caller
      }
    },
    [db]
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("Attempting to delete chat:", {
        id: item.id,
        description: item.description,
      });

      deleteChat(item.id)
        .then(() => {
          toast.success("Chat deleted successfully", {
            position: "bottom-right",
            autoClose: 3000,
          });

          loadEntries();

          if (chatId.get() === item.id) {
            console.log("Navigating away from deleted chat");
            window.location.pathname = "/";
          }
        })
        .catch((error) => {
          console.error("Failed to delete chat:", error);
          toast.error("Failed to delete conversation", {
            position: "bottom-right",
            autoClose: 3000,
          });

          loadEntries();
        });
    },
    [loadEntries, deleteChat]
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        console.log("Bulk delete skipped: No DB or no items to delete.");
        return;
      }

      console.log(
        `Starting bulk delete for ${itemsToDeleteIds.length} chats`,
        itemsToDeleteIds
      );

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
        toast.success(
          `${deletedCount} chat${deletedCount === 1 ? "" : "s"} deleted successfully`
        );
      } else {
        toast.warning(
          `Deleted ${deletedCount} of ${itemsToDeleteIds.length} chats. ${errors.length} failed.`,
          {
            autoClose: 5000,
          }
        );
      }

      await loadEntries();

      setSelectedItems([]);
      setSelectionMode(false);

      if (shouldNavigate) {
        console.log("Navigating away from deleted chat");
        window.location.pathname = "/";
      }
    },
    [deleteChat, loadEntries, db]
  );

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const newSelectedItems = prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id];
      console.log("Selected items updated:", newSelectedItems);
      return newSelectedItems;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected =
        allFilteredIds.length > 0 &&
        allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        const newSelectedItems = prev.filter(
          (id) => !allFilteredIds.includes(id)
        );
        console.log(
          "Deselecting all filtered items. New selection:",
          newSelectedItems
        );
        return newSelectedItems;
      } else {
        const newSelectedItems = [...new Set([...prev, ...allFilteredIds])];
        console.log(
          "Selecting all filtered items. New selection:",
          newSelectedItems
        );
        return newSelectedItems;
      }
    });
  }, [filteredList]);

  const setDialogContentWithLogging = useCallback((content: DialogContent) => {
    console.log("Setting dialog content:", content);
    setDialogContent(content);
  }, []);

  useEffect(() => {
    if (isSidebarOpen) {
      loadEntries();
    }
  }, [isSidebarOpen, loadEntries]);

  useEffect(() => {
    if (!isSidebarOpen && selectionMode) {
      console.log("Sidebar closed, preserving selection state");
    }
  }, [isSidebarOpen, selectionMode]);

  const handleDuplicate = async (id: string) => {
    await duplicateCurrentChat(id);
    loadEntries(); // Reload the list after duplication
  };

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info("Select at least one chat to delete");
      return;
    }

    const selectedChats = list.filter((item) =>
      selectedItems.includes(item.id)
    );

    if (selectedChats.length === 0) {
      toast.error("Could not find selected chats");
      return;
    }

    setDialogContent({ type: "bulkDelete", items: selectedChats });
  }, [selectedItems, list]);

  useEffect(() => {
    if (user?.id && !hasMigrated && db) {
      migrateExistingChatsToUser(db, user.id)
        .then(() => {
          setHasMigrated(true);
          console.log("Successfully migrated existing chats to user:", user.id);
        })
        .catch((error) => {
          console.error("Failed to migrate chats:", error);
        });
    }
  }, [user?.id, hasMigrated]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    sidebarStore.set(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      sidebarStore.set(false);
    }, 300); // Small delay to prevent accidental closing
  };

  useEffect(() => {
    // Add/remove a class to the body when the menu is open/closed
    // This will be used to control the header logo visibility
    document.body.classList.toggle("sidebar-open", isSidebarOpen || isHovering);
  }, [isSidebarOpen, isHovering]);

  const handleSignOut = async () => {
    try {
      setIsLoading(true);

      // Navigate first, then sign out
      window.location.href = "/";

      // Sign out after navigation is initiated
      const { error } = await signOut();

      if (error) {
        console.error("Sign out error:", error);
        toast.error("Failed to sign out");
      }
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  // Add touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startX = touch.clientX;
    const threshold = 50; // minimum distance to trigger close

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;

      if (deltaX < -threshold) {
        sidebarStore.set(false);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      }
    };

    const handleTouchEnd = () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };

    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
  }, []);

  return (
    <>
      {/* Remove hover trigger area */}

      <motion.div
        ref={menuRef}
        initial="closed"
        animate={isSidebarOpen ? "open" : "closed"}
        variants={menuVariants}
        className={classNames(
          "fixed left-0 top-0 h-full w-[300px] sm:w-[340px] flex flex-col",
          "bg-white dark:bg-[#141414]",
          "shadow-2xl",
          "text-sm overflow-hidden",
          "z-[999] rounded-r-2xl",
          "touch-pan-y"
        )}
      >
        {/* Header with menu icon and logo */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 h-[var(--header-height)]">
          <button
            onClick={() => sidebarStore.set(false)}
            className="flex items-center justify-center p-2 bg-transparent rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span className="i-ph:sidebar-simple w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          <a
            href="/"
            className="text-2xl font-semibold text-accent flex items-center"
            onClick={() => {
              // Show loading animation immediately when clicking sidebar logo
              startNavigationLoading();
            }}
          >
            {!chat.started ? (
              <>
                <img
                  src="/logo-light-styled.png"
                  alt="logo"
                  className="w-[70px] sm:w-[90px] inline-block dark:hidden"
                />
                <img
                  src="/logo-dark-styled.png"
                  alt="logo"
                  className="w-[70px] sm:w-[90px] inline-block hidden dark:block"
                />
              </>
            ) : (
              <>
                <img
                  src="/chat-logo-light-styled.png"
                  alt="logo"
                  className="w-[70px] sm:w-[90px] inline-block dark:hidden"
                />
                <img
                  src="/chat-logo-dark-styled.png"
                  alt="logo"
                  className="w-[70px] sm:w-[90px] inline-block hidden dark:block"
                />
              </>
            )}
          </a>
        </div>

        {/* Search section */}
        <div className="p-5 space-y-3">
          <div className="relative w-full">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <div className="i-ph:magnifying-glass text-[16px]" />
            </div>
            <input
              className="w-full bg-gray-100 dark:bg-[#1a1a1a] pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 border border-gray-200 dark:border-[#2a2a2a] transition-all duration-200"
              type="search"
              placeholder="Search Chats ..."
              onChange={handleSearchChange}
              aria-label="Search chats"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 w-full">
            <motion.button
              onClick={() => {
                // Check if we're currently streaming
                if (streamingState.get()) {
                  const confirmNavigation = window.confirm(
                    "Code generation is in progress. Creating a new chat will stop the generation. Do you want to continue?"
                  );

                  if (!confirmNavigation) {
                    return;
                  }
                }

                // Close the sidebar before navigating
                sidebarStore.set(false);

                // Show loading animation immediately
                startNavigationLoading();

                // Navigate to home to create a new chat
                window.location.href = "/";
              }}
              className="w-1/2 flex gap-2 items-center justify-center bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-900 dark:text-white rounded-lg px-3 py-2 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="inline-block i-ph:plus-circle h-4 w-4" />
              <span className="text-sm">New Chat</span>
            </motion.button>
            <motion.button
              onClick={() => setSelectionMode(!selectionMode)}
              className="w-1/2 flex gap-2 items-center justify-center bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-lg px-3 py-2 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="inline-block i-ph:trash h-4 w-4" />
              <span className="text-sm">Delete Chat</span>
            </motion.button>
          </div>

          {/* Selection Mode Controls */}
          {selectionMode && (
            <div className="flex flex-col gap-2 p-2 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg border border-gray-200 dark:border-[#2a2a2a]">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedItems.length === 0
                    ? "Select chats to delete"
                    : `${selectedItems.length} selected`}
                </span>
                <button
                  onClick={() => setSelectionMode(false)}
                  className="flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1.5 rounded-md bg-transparent hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition-colors"
                >
                  <div className="i-ph:x-bold w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 px-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="flex-1 h-8 bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333333]"
                >
                  {selectedItems.length === filteredList.length
                    ? "Deselect all"
                    : "Select all"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedItems.length === 0}
                  className="flex-1 h-8 bg-red-500 text-white hover:bg-red-600 disabled:bg-red-500/50 disabled:text-white/50"
                >
                  Delete{" "}
                  {selectedItems.length > 0 ? `(${selectedItems.length})` : ""}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-auto modern-scrollbar-dark-grey">
          <div className="flex items-center justify-between text-sm px-5 py-2">
            <div className="font-medium text-gray-600 dark:text-gray-400">
              Your Chats
            </div>
          </div>
          <div className="px-3 pb-3 hover:pr-2 transition-all duration-200">
            {filteredList.length === 0 && (
              <div className="px-4 text-gray-500 dark:text-gray-500 text-sm">
                {list.length === 0
                  ? "No Previous Conversations"
                  : "No Matches Found"}
              </div>
            )}
            {binDates(filteredList).map(({ category, items }) => (
              <div key={category} className="mt-2 first:mt-0 space-y-1">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-500 sticky top-0 z-1 bg-white dark:bg-[#141414] px-4 py-1">
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
                        setDialogContentWithLogging({ type: "delete", item });
                      }}
                      onDuplicate={() => handleDuplicate(item.id)}
                      selectionMode={selectionMode}
                      isSelected={selectedItems.includes(item.id)}
                      onToggleSelection={toggleItemSelection}
                      onRefresh={loadEntries}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Logo Generator Section */}
        <div className="border-t border-gray-200 dark:border-[#2a2a2a]">
          <div className="p-2">
            <a
              href="/logo"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                startNavigationLoading();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-transparent hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors"
            >
              <span className="i-ph:palette h-4 w-4" />
              <span>VxC Logo Generator</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-[#2a2a2a]">
          <div className="p-2">
            <button
              onClick={handleOpenSettings}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-transparent hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors"
            >
              <span className="i-ph:gear h-4 w-4" />
              <span>Settings</span>
            </button>
            <button
              onClick={handleSignOut}
              disabled={isLoading}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-transparent hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors"
            >
              <span className="i-ph:sign-out h-4 w-4" />
              <span>{isLoading ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>

          {/* User Profile */}
          <div className="p-3">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
              {profile.avatar || user?.user_metadata?.avatar_url ? (
                <div className="flex items-center justify-center w-8 h-8 overflow-hidden rounded-full shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm">
                  <img
                    src={(function () {
                      const direct =
                        profile.avatar || user.user_metadata.avatar_url;
                      if (!direct) return "";
                      return /https?:\/\/([^.]+\.)?googleusercontent\.com\//.test(
                        direct
                      )
                        ? `/api/image-proxy?url=${encodeURIComponent(direct)}`
                        : direct;
                    })()}
                    alt={
                      profile.username ||
                      user.user_metadata?.name ||
                      user.email?.split("@")[0] ||
                      "User"
                    }
                    className="w-full h-full rounded-full object-cover"
                    loading="eager"
                    decoding="sync"
                    onError={(e) => {
                      // If image fails to load, replace with initial
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML = `
                        <div class="w-full h-full flex items-center justify-center rounded-full bg-accent-600 text-white font-medium">
                          ${(profile.username?.[0] || user.user_metadata?.name?.[0] || user.email?.[0] || "U").toUpperCase()}
                        </div>
                      `;
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-accent-600 text-white font-medium shadow-sm">
                  {(
                    profile.username?.[0] ||
                    user.user_metadata?.name?.[0] ||
                    user.email?.[0] ||
                    "U"
                  ).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {profile.username ||
                    user.user_metadata?.name ||
                    user.email?.split("@")[0] ||
                    "User"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 truncate">
                  {user.email}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Backdrop */}
      {isSidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[998] bg-black/20 dark:bg-black/40"
          onClick={() => sidebarStore.set(false)}
        />
      )}

      {/* Settings panel */}
      {isSettingsOpen && (
        <ControlPanel open={isSettingsOpen} onClose={handleCloseSettings} />
      )}

      <DialogRoot open={dialogContent !== null}>
        {dialogContent?.type === "delete" && (
          <Dialog showCloseButton={false}>
            <div className="p-6">
              <DialogTitle>Delete chat</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this chat? This action cannot be
                undone.
              </DialogDescription>
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setDialogContent(null)}
                  className="border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    if (dialogContent.item) {
                      deleteItem(event, dialogContent.item);
                    }
                    setDialogContent(null);
                  }}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Dialog>
        )}
        {dialogContent?.type === "bulkDelete" && (
          <Dialog showCloseButton={false}>
            <div className="p-6">
              <DialogTitle>Delete multiple chats</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {dialogContent.items.length}{" "}
                chat
                {dialogContent.items.length === 1 ? "" : "s"}? This action
                cannot be undone.
              </DialogDescription>
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setDialogContent(null)}
                  className="border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    if (dialogContent.items) {
                      deleteSelectedItems(
                        dialogContent.items.map((item) => item.id)
                      );
                    }
                    setDialogContent(null);
                  }}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Dialog>
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
          console.log("Successfully migrated existing chats to user:", user.id);
        })
        .catch((error) => {
          console.error("Failed to migrate chats:", error);
        });
    }
  }, [user?.id, hasMigrated]);

  if (!user) {
    return null;
  }

  return <MenuComponent isLandingPage={isLandingPage} />;
};
