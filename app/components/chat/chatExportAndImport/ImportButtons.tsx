import type { Message } from "ai";
import { toast } from "react-toastify";
import { ImportFolderButton } from "~/components/chat/ImportFolderButton";
import { Button } from "~/components/ui/Button";
import { classNames } from "~/utils/classNames";
import GitCloneButton from "~/components/chat/GitCloneButton";

type ChatData = {
  messages?: Message[]; // Standard Bolt format
  description?: string; // Optional description
};

export function ImportButtons(
  importChat:
    | ((description: string, messages: Message[]) => Promise<void>)
    | undefined
) {
  return (
    <div className="flex flex-col items-center justify-center w-auto">
      <input
        type="file"
        id="chat-import"
        className="hidden"
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0];

          if (file && importChat) {
            try {
              const reader = new FileReader();

              reader.onload = async (e) => {
                try {
                  const content = e.target?.result as string;
                  const data = JSON.parse(content) as ChatData;

                  // Standard format
                  if (Array.isArray(data.messages)) {
                    await importChat(
                      data.description || "Imported Chat",
                      data.messages
                    );

                    return;
                  }

                  toast.error("Invalid chat file format");
                } catch (error: unknown) {
                  if (error instanceof Error) {
                    toast.error("Failed to parse chat file: " + error.message);
                  } else {
                    toast.error("Failed to parse chat file");
                  }
                }
              };
              reader.onerror = () => toast.error("Failed to read chat file");
              reader.readAsText(file);
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Failed to import chat"
              );
            }
            e.target.value = ""; // Reset file input
          } else {
            toast.error("Something went wrong");
          }
        }}
      />
      <div className="flex flex-col items-center gap-4 max-w-2xl text-center">
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const input = document.getElementById("chat-import");
              input?.click();
            }}
            variant="default"
            size="lg"
            className={classNames(
              "gap-2 bg-gray-50 dark:bg-gray-950",
              "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary",
              "hover:bg-gray-100 dark:hover:bg-gray-900",
              "border border-[#e5e7eb] dark:border-[rgba(255,255,255,0.08)]",
              "h-10 px-3 sm:px-4 py-2 min-w-[100px] sm:min-w-[120px] justify-center",
              "transition-all duration-200 ease-in-out"
            )}
          >
            <span className="i-ph:upload-simple w-4 h-4" />
            <span className="hidden sm:inline">Import Chat</span>
            <span className="sm:hidden">Chat</span>
          </Button>
          <ImportFolderButton
            importChat={importChat}
            className={classNames(
              "gap-2 bg-gray-50 dark:bg-gray-950",
              "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary",
              "hover:bg-gray-100 dark:hover:bg-gray-900",
              "border border-[#e5e7eb] dark:border-[rgba(255,255,255,0.08)]",
              "h-10 px-3 sm:px-4 py-2 min-w-[100px] sm:min-w-[120px] justify-center",
              "transition-all duration-200 ease-in-out"
            )}
          />
          <GitCloneButton
            importChat={importChat}
            className={classNames(
              "gap-2 bg-gray-50 dark:bg-gray-950",
              "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary",
              "hover:bg-gray-100 dark:hover:bg-gray-900",
              "border border-[#e5e7eb] dark:border-[rgba(255,255,255,0.08)]",
              "h-10 px-3 sm:px-4 py-2 min-w-[100px] sm:min-w-[120px] justify-center",
              "transition-all duration-200 ease-in-out"
            )}
          />
        </div>
      </div>
    </div>
  );
}
