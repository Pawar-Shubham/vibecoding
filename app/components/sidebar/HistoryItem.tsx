import { useParams } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import { type ChatHistoryItem } from '~/lib/persistence';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { forwardRef, type ForwardedRef, useCallback } from 'react';
import { Checkbox } from '~/components/ui/Checkbox';
import { Link, useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { streamingState } from '~/lib/stores/streaming';
import { toast } from 'react-toastify';
import { sidebarStore } from '~/lib/stores/sidebar';
// Use window events to communicate with root navigation loading
const startNavigationLoading = () => {
  window.dispatchEvent(new CustomEvent('start-navigation-loading'));
};

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
  onDuplicate?: (id: string) => void;
  exportChat: (id?: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  onRefresh?: () => void;
}

export function HistoryItem({
  item,
  onDelete,
  onDuplicate,
  exportChat,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  onRefresh,
}: HistoryItemProps) {
  const { id: urlId } = useParams();
  const isActiveChat = urlId === item.urlId;
  const navigate = useNavigate();
  const isStreaming = useStore(streamingState);

  const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
    useEditChatDescription({
      initialDescription: item.description,
      customChatId: item.id,
      syncWithGlobalStore: isActiveChat,
      onSuccess: onRefresh,
    });

  const handleChatNavigation = useCallback(
    (e: React.MouseEvent) => {
      if (selectionMode) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Item clicked in selection mode:', item.id);
        onToggleSelection?.(item.id);
        return;
      }

      // Check if we're currently streaming/generating code
      if (isStreaming && !isActiveChat) {
        e.preventDefault();
        e.stopPropagation();
        
        // Show a confirmation dialog
        const confirmNavigation = window.confirm(
          'Code generation is in progress. Navigating away will stop the generation. Do you want to continue?'
        );
        
        if (confirmNavigation) {
          // Show loading animation immediately
          startNavigationLoading();
          navigate(`/chat/${item.urlId}`);
          // Close the sidebar after navigation
          sidebarStore.set(false);
        }
        return;
      }

      // If it's already the active chat, prevent navigation
      if (isActiveChat) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Let the normal navigation happen for other cases
      // Show loading animation immediately
      startNavigationLoading();
      // Close the sidebar after navigation
      sidebarStore.set(false);
    },
    [selectionMode, item.id, item.urlId, onToggleSelection, isStreaming, isActiveChat, navigate],
  );

  const handleCheckboxChange = useCallback(() => {
    console.log('Checkbox changed for item:', item.id);
    onToggleSelection?.(item.id);
  }, [item.id, onToggleSelection]);

  const handleDeleteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('Delete button clicked for item:', item.id);

      if (onDelete) {
        onDelete(event as unknown as React.UIEvent);
      }
    },
    [onDelete, item.id],
  );

  return (
    <div
      className={classNames(
        'group rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/30 overflow-hidden flex justify-between items-center px-3 py-2 transition-colors',
        { 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800/30': isActiveChat },
        { 'cursor-pointer': selectionMode },
      )}
      onClick={handleChatNavigation}
    >
      {selectionMode && (
        <div className="flex items-center mr-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            id={`select-${item.id}`}
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
            className="h-4 w-4"
          />
        </div>
      )}

      <Link
        to={`/chat/${item.urlId}`}
        className="flex-1 min-w-0 flex items-center gap-2"
        onClick={handleChatNavigation}
      >
        <div className="flex-1 min-w-0">
          <div className="truncate text-inherit">{item.description}</div>
        </div>
      </Link>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChatActionButton
          toolTipContent="Export chat"
          icon="i-ph:export text-lg"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            exportChat(item.id);
          }}
        />
        <ChatActionButton
          toolTipContent="Duplicate chat"
          icon="i-ph:copy text-lg"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDuplicate?.(item.id);
          }}
        />
        <ChatActionButton
          toolTipContent="Delete chat"
          icon="i-ph:trash text-lg"
          className="hover:!text-red-500"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

const ChatActionButton = forwardRef(
  (
    {
      toolTipContent,
      icon,
      className,
      onClick,
    }: {
      toolTipContent: string;
      icon: string;
      className?: string;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
      btnTitle?: string;
    },
    ref: ForwardedRef<HTMLButtonElement>,
  ) => {
    return (
      <WithTooltip tooltip={toolTipContent} position="bottom" sideOffset={4}>
        <button
          ref={ref}
          type="button"
          className={`text-gray-500 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors ${icon} ${className ? className : ''}`}
          onClick={onClick}
        />
      </WithTooltip>
    );
  },
);
