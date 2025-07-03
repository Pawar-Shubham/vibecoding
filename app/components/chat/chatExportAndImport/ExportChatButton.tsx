import WithTooltip from "~/components/ui/Tooltip";
import { IconButton } from "~/components/ui/IconButton";
import React from "react";

export const ExportChatButton = ({
  exportChat,
}: {
  exportChat?: () => void;
}) => {
  return (
    <WithTooltip tooltip="Export Chat">
      <IconButton
        title="Export Chat"
        className="transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center"
        onClick={() => exportChat?.()}
      >
        <div className="i-ph:download-simple text-lg sm:text-xl flex-shrink-0"></div>
      </IconButton>
    </WithTooltip>
  );
};
