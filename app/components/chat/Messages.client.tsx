import type { Message } from "ai";
import { Fragment } from "react";
import { classNames } from "~/utils/classNames";
import { AssistantMessage } from "./AssistantMessage";
import { UserMessage } from "./UserMessage";
import { useLocation } from "@remix-run/react";
import { db, chatId } from "~/lib/persistence/useChatHistory";
import { forkChat } from "~/lib/persistence/db";
import { toast } from "react-toastify";
import { useStore } from "@nanostores/react";
import { profileStore } from "~/lib/stores/profile";
import { forwardRef } from "react";
import type { ForwardedRef } from "react";
import { useAuth } from "~/lib/hooks/useAuth";

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;
    const location = useLocation();
    const profile = useStore(profileStore);
    const { user } = useAuth();

    const handleRewind = (messageId: string) => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set("rewindTo", messageId);
      window.location.search = searchParams.toString();
    };

    const handleFork = async (messageId: string) => {
      try {
        if (!db || !chatId.get()) {
          toast.error("Chat persistence is not available");
          return;
        }

        const urlId = await forkChat(db, chatId.get()!, messageId);
        window.location.href = `/chat/${urlId}`;
      } catch (error) {
        toast.error("Failed to fork chat: " + (error as Error).message);
      }
    };

    // Prioritize profile store avatar over user metadata
    const directAvatar =
      profile?.avatar || user?.user_metadata?.avatar_url || null;
    const userAvatar =
      directAvatar &&
      /https?:\/\/([^.]+\.)?googleusercontent\.com\//.test(directAvatar)
        ? `/api/image-proxy?url=${encodeURIComponent(directAvatar)}`
        : directAvatar;
    const userName =
      profile?.username || user?.user_metadata?.name || user?.email || "User";
    const userInitial = userName[0].toUpperCase();
    
    // Debug logging to see what values are being used
    console.log("Messages Debug:", {
      profileUsername: profile?.username,
      userMetadataName: user?.user_metadata?.name,
      userEmail: user?.email,
      finalUserName: userName,
      finalUserInitial: userInitial
    });

    return (
      <div id={id} className={props.className} ref={ref}>
        {messages.length > 0
          ? messages.map((message, index) => {
              const { role, content, id: messageId, annotations } = message;
              const isUserMessage = role === "user";
              const isFirst = index === 0;
              const isLast = index === messages.length - 1;
              const isHidden = annotations?.includes("hidden");

              if (isHidden) {
                return <Fragment key={index} />;
              }

              return (
                <div
                  key={index}
                  className={classNames(
                    "flex gap-4 p-6 py-5 w-full rounded-[calc(0.75rem-1px)]",
                    {
                      "bg-white dark:bg-gray-900":
                        isUserMessage ||
                        !isStreaming ||
                        (isStreaming && !isLast),
                      "bg-gradient-to-b from-white dark:from-gray-900 from-30% to-transparent":
                        isStreaming && isLast,
                      "mt-4": !isFirst,
                    }
                  )}
                >
                  {isUserMessage && (
                    <div className="flex items-center justify-center w-[40px] h-[40px] overflow-hidden rounded-full shrink-0 self-start">
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt="User avatar"
                          className="w-full h-full rounded-full object-cover"
                          onError={(e) => {
                            // If image fails to load, replace with initial
                            e.currentTarget.style.display = "none";
                            e.currentTarget.parentElement!.innerHTML = `
                              <div class="w-full h-full flex items-center justify-center rounded-full bg-accent-600 text-white font-medium">
                                ${userInitial}
                              </div>
                            `;
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center rounded-full bg-accent-600 text-white font-medium">
                          {userInitial}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-col-1 w-full">
                    {isUserMessage ? (
                      <UserMessage content={content} />
                    ) : (
                      <AssistantMessage
                        content={content}
                        annotations={message.annotations}
                        messageId={messageId}
                        onRewind={handleRewind}
                        onFork={handleFork}
                      />
                    )}
                  </div>
                </div>
              );
            })
          : null}
        {isStreaming && (
          <div className="text-center w-full text-bolt-elements-item-contentAccent i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
        )}
      </div>
    );
  }
);
