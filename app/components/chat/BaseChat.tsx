/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from "ai";
import React, { type RefCallback, useEffect, useState, lazy, Suspense } from "react";
import { ClientOnly } from "remix-utils/client-only";
import { Menu } from "~/components/sidebar/Menu.client";
import { IconButton } from "~/components/ui/IconButton";
import { classNames } from "~/utils/classNames";
import { PROVIDER_LIST } from "~/utils/constants";
import { Messages } from "./Messages.client";
import { SendButton } from "./SendButton.client";
import { APIKeyManager, getApiKeysFromCookies } from "./APIKeyManager";
import Cookies from "js-cookie";
import * as Tooltip from "@radix-ui/react-tooltip";

import styles from "./BaseChat.module.scss";
import { ExportChatButton } from "~/components/chat/chatExportAndImport/ExportChatButton";
import { ImportButtons } from "~/components/chat/chatExportAndImport/ImportButtons";
import { ExamplePrompts } from "~/components/chat/ExamplePrompts";
import GitCloneButton from "./GitCloneButton";

import FilePreview from "./FilePreview";
import { ModelSelector } from "~/components/chat/ModelSelector";
import { SpeechRecognitionButton } from "~/components/chat/SpeechRecognition";
import type { ProviderInfo } from "~/types/model";
import { ScreenshotStateManager } from "./ScreenshotStateManager";
import { toast } from "react-toastify";
import StarterTemplates from "./StarterTemplates";
import type { ActionAlert, SupabaseAlert, DeployAlert } from "~/types/actions";
import DeployChatAlert from "~/components/deploy/DeployAlert";
import ChatAlert from "./ChatAlert";
import type { ModelInfo } from "~/lib/modules/llm/types";
import ProgressCompilation from "./ProgressCompilation";
import type { ProgressAnnotation } from "~/types/context";
import type { ActionRunner } from "~/lib/runtime/action-runner";
import { LOCAL_PROVIDERS } from "~/lib/stores/settings";
import { SupabaseChatAlert } from "~/components/chat/SupabaseAlert";
import { SupabaseConnection } from "./SupabaseConnection";
import { ExpoQrModal } from "~/components/workbench/ExpoQrModal";
import { expoUrlAtom } from "~/lib/stores/qrCodeStore";
import { useStore } from "@nanostores/react";
import { StickToBottom, useStickToBottomContext } from "~/lib/hooks";
import { useStore as useChatStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';
import { useAuth } from '~/lib/hooks/useAuth';
import { useNavigate } from '@remix-run/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useSettingsStore } from '~/lib/stores/settings';
import { streamingState } from '~/lib/stores/streaming';

// Lazy load the heavy Workbench component
const Workbench = lazy(() => import("~/components/workbench/Workbench.client").then(module => ({ default: module.Workbench })));

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  data?: JSONValue[] | undefined;
  actionRunner?: ActionRunner;
  auth?: any;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = "",
      enhancingPrompt,
      handleInputChange,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      data,
      actionRunner,
      auth,
    },
    ref
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(
      getApiKeysFromCookies()
    );
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] =
      useState(true);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(
      null
    );
    const [transcript, setTranscript] = useState("");
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>(
      "all"
    );
    const [progressAnnotations, setProgressAnnotations] = useState<
      ProgressAnnotation[]
    >([]);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === "object" && (x as any).type === "progress"
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (
        typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
      ) {
        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join("");

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== "undefined") {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error("Error loading API keys from cookies:", error);
          Cookies.remove("apiKeys");
        }

        setIsModelLoading("all");
        fetch("/api/models")
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error("Error fetching model list:", error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set("apiKeys", JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(
          `/api/models/${encodeURIComponent(providerName)}`
        );
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error("Error loading dynamic models for:", providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter(
          (model) => model.provider !== providerName
        );
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        const finalInput = messageInput || input;
        if (!auth) {
          // Store the prompt text in a cookie
          Cookies.set("pending_prompt", finalInput);
          // Show auth modal
          const event = new CustomEvent("open-auth-modal");
          window.dispatchEvent(event);
          return;
        }

        if (isStreaming) {
          handleStop?.();
          return;
        }

        sendMessage(event, messageInput);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(""); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: "" },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(
          styles.BaseChat,
          "relative flex h-full w-full overflow-hidden"
        )}
        data-chat-visible={showChat}
      >
        <div className="fixed inset-0 w-screen h-screen pointer-events-none overflow-hidden -z-[1]">
          <div
            className="absolute rounded-[50%] blur-[150px] mix-blend-soft-light"
            style={{
              width: "800px",
              height: "800px",
              background:
                "radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, rgba(7, 242, 156, 0.06) 60%, rgba(242, 229, 159, 0.04) 100%)",
              animation: "roamOrb1 30s infinite ease-in-out",
            }}
          />
          <div
            className="absolute rounded-[50%] blur-[150px] mix-blend-soft-light"
            style={{
              width: "900px",
              height: "900px",
              background:
                "radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, rgba(56, 189, 248, 0.08) 40%, rgba(7, 242, 156, 0.05) 100%)",
              animation: "roamOrb2 35s infinite ease-in-out",
            }}
          />
        </div>

        <style
          dangerouslySetInnerHTML={{
            __html: `
            @keyframes roamOrb1 {
              0%, 100% { 
                transform: translate(-10vw, -10vh) scale(0.95);
                filter: blur(150px) contrast(1.2) saturate(1.1);
              }
              25% { 
                transform: translate(60vw, 20vh) scale(1.05);
                filter: blur(180px) contrast(1.3) saturate(1.2);
              }
              50% { 
                transform: translate(70vw, 70vh) scale(0.98);
                filter: blur(160px) contrast(1.25) saturate(1.15);
              }
              75% { 
                transform: translate(10vw, 60vh) scale(1.02);
                filter: blur(170px) contrast(1.2) saturate(1.1);
              }
            }
            @keyframes roamOrb2 {
              0%, 100% { 
                transform: translate(70vw, 70vh) scale(1.02);
                filter: blur(170px) contrast(1.2) saturate(1.1);
              }
              25% { 
                transform: translate(10vw, 60vh) scale(0.98);
                filter: blur(160px) contrast(1.25) saturate(1.15);
              }
              50% { 
                transform: translate(-5vw, 10vh) scale(1.05);
                filter: blur(180px) contrast(1.3) saturate(1.2);
              }
              75% { 
                transform: translate(60vw, -5vh) scale(0.95);
                filter: blur(150px) contrast(1.2) saturate(1.1);
              }
            }
          `,
          }}
        />

        <div className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div
            className={classNames(
              styles.Chat,
              "flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full"
            )}
          >
            {!chatStarted && (
              <div
                id="intro"
                className="mt-[8vh] lg:mt-[13.5vh] w-full max-w-3xl mx-auto text-center px-4 lg:px-0 mb-4"
              >
                <h1 className="text-2xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-1 lg:mb-2 animate-fade-in flex items-center justify-center gap-2">
                  <span className="text-2xl lg:text-5xl flex items-center gap-0">
                    Build better with{" "}
                    <img
                      src="/logo-dark-styled.png"
                      alt="logo"
                      className="h-[40px] lg:h-[75px] w-auto hidden dark:inline-block"
                    />
                    <img
                      src="/chat-logo-light-styled.png"
                      alt="logo"
                      className="h-[40px] lg:h-[75px] w-auto dark:hidden inline-block"
                    />
                  </span>
                </h1>
                <p
                  className="mb-0 text-bolt-elements-textSecondary animate-fade-in animation-delay-200"
                  style={{
                    fontSize: "1.3rem",
                    lineHeight: "1.2",
                    marginBottom: "0.5rem",
                  }}
                >
                  innovation begins with your{" "}
                  <span className="text-black dark:text-white">vibe</span>.
                </p>
                <ClientOnly>{() => <Menu isLandingPage={true} />}</ClientOnly>
              </div>
            )}
            <StickToBottom
              className={classNames("pt-2 px-2 sm:px-6 relative", {
                "h-full flex flex-col": chatStarted,
              })}
              resize="smooth"
              initial="smooth"
            >
              <StickToBottom.Content className="flex flex-col gap-4">
                <ClientOnly>
                  {() => {
                    return chatStarted ? (
                      <Messages
                        className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1"
                        messages={messages}
                        isStreaming={isStreaming}
                      />
                    ) : null;
                  }}
                </ClientOnly>
              </StickToBottom.Content>
              <div
                className={classNames(
                  "my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6",
                  {
                    "sticky bottom-2": chatStarted,
                  }
                )}
              >
                <div className="flex flex-col gap-2">
                  {deployAlert && (
                    <DeployChatAlert
                      alert={deployAlert}
                      clearAlert={() => clearDeployAlert?.()}
                      postMessage={(message: string | undefined) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {supabaseAlert && (
                    <SupabaseChatAlert
                      alert={supabaseAlert}
                      clearAlert={() => clearSupabaseAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {actionAlert && (
                    <ChatAlert
                      alert={actionAlert}
                      clearAlert={() => clearAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearAlert?.();
                      }}
                    />
                  )}
                </div>
                <ScrollToBottom />
                {progressAnnotations && (
                  <ProgressCompilation data={progressAnnotations} />
                )}
                <div
                  className={classNames(
                    styles.MaterialPrompt,
                    "relative w-full max-w-chat mx-auto z-prompt"
                  )}
                >
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-3 shadow-lg">
                    <div>
                      <ClientOnly>
                        {() => (
                          <div
                            className={isModelSettingsCollapsed ? "hidden" : ""}
                          >
                            <ModelSelector
                              key={provider?.name + ":" + modelList.length}
                              model={model}
                              setModel={setModel}
                              modelList={modelList}
                              provider={provider}
                              setProvider={setProvider}
                              providerList={
                                providerList ||
                                (PROVIDER_LIST as ProviderInfo[])
                              }
                              apiKeys={apiKeys}
                              modelLoading={isModelLoading}
                            />
                            {(providerList || []).length > 0 &&
                              provider &&
                              (!LOCAL_PROVIDERS.includes(provider.name) ||
                                "OpenAILike") && (
                                <APIKeyManager
                                  provider={provider}
                                  apiKey={apiKeys[provider.name] || ""}
                                  setApiKey={(key) => {
                                    onApiKeysChange(provider.name, key);
                                  }}
                                />
                              )}
                          </div>
                        )}
                      </ClientOnly>
                    </div>
                    <FilePreview
                      files={uploadedFiles}
                      imageDataList={imageDataList}
                      onRemove={(index) => {
                        setUploadedFiles?.(
                          uploadedFiles.filter((_, i) => i !== index)
                        );
                        setImageDataList?.(
                          imageDataList.filter((_, i) => i !== index)
                        );
                      }}
                    />
                    <ClientOnly>
                      {() => (
                        <ScreenshotStateManager
                          setUploadedFiles={setUploadedFiles}
                          setImageDataList={setImageDataList}
                          uploadedFiles={uploadedFiles}
                          imageDataList={imageDataList}
                        />
                      )}
                    </ClientOnly>
                    <div className="relative backdrop-blur">
                      <textarea
                        ref={textareaRef}
                        className={classNames(
                          "w-full pl-4 pt-4 pr-4 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm"
                        )}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = "2px solid #1488fc";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = "2px solid #1488fc";
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border =
                            "1px solid var(--bolt-elements-borderColor)";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border =
                            "1px solid var(--bolt-elements-borderColor)";

                          const files = Array.from(e.dataTransfer.files);
                          files.forEach((file) => {
                            if (file.type.startsWith("image/")) {
                              const reader = new FileReader();

                              reader.onload = (e) => {
                                const base64Image = e.target?.result as string;
                                setUploadedFiles?.([...uploadedFiles, file]);
                                setImageDataList?.([
                                  ...imageDataList,
                                  base64Image,
                                ]);
                              };
                              reader.readAsDataURL(file);
                            }
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            if (event.shiftKey) {
                              return;
                            }

                            event.preventDefault();

                            if (isStreaming) {
                              handleStop?.();
                              return;
                            }

                            // ignore if using input method engine
                            if (event.nativeEvent.isComposing) {
                              return;
                            }

                            handleSendMessage?.(event);
                          }
                        }}
                        value={input}
                        onChange={(event) => {
                          handleInputChange?.(event);
                        }}
                        onPaste={handlePaste}
                        style={{
                          minHeight: TEXTAREA_MIN_HEIGHT,
                          maxHeight: TEXTAREA_MAX_HEIGHT,
                        }}
                        placeholder="How can VxC help you today?"
                        translate="no"
                      />
                      <div className="flex justify-between items-center text-sm p-4 pt-2">
                        <div className="flex-shrink-0 flex items-center gap-2">
                          {chatStarted && <SupabaseConnection />}
                          {input.length > 3 ? (
                            <div className="text-xs text-bolt-elements-textTertiary">
                              Use{" "}
                              <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                                Shift
                              </kbd>{" "}
                              +{" "}
                              <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                                Return
                              </kbd>{" "}
                              a new line
                            </div>
                          ) : null}
                        </div>

                        <div className="flex gap-1 sm:gap-2 items-center ml-auto">
                          <IconButton
                            title="Upload file"
                            className="transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center"
                            onClick={() => handleFileUpload()}
                          >
                            <div className="i-ph:paperclip text-lg sm:text-xl flex-shrink-0"></div>
                          </IconButton>
                          <IconButton
                            title="Enhance prompt"
                            disabled={input.length === 0 || enhancingPrompt}
                            className={classNames(
                              "transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center",
                              enhancingPrompt ? "opacity-100" : ""
                            )}
                            onClick={() => {
                              enhancePrompt?.();
                              toast.success("Prompt enhanced!");
                            }}
                          >
                            {enhancingPrompt ? (
                              <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-lg sm:text-xl animate-spin flex-shrink-0"></div>
                            ) : (
                              <div className="i-bolt:stars text-lg sm:text-xl flex-shrink-0"></div>
                            )}
                          </IconButton>

                          <SpeechRecognitionButton
                            isListening={isListening}
                            onStart={startListening}
                            onStop={stopListening}
                            disabled={isStreaming}
                          />
                          {chatStarted && (
                            <ClientOnly>
                              {() => (
                                <ExportChatButton exportChat={exportChat} />
                              )}
                            </ClientOnly>
                          )}
                          <IconButton
                            title="Model Settings"
                            className={classNames(
                              "transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center gap-0.5 sm:gap-1",
                              {
                                "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent":
                                  isModelSettingsCollapsed,
                                "bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault":
                                  !isModelSettingsCollapsed,
                              }
                            )}
                            onClick={() =>
                              setIsModelSettingsCollapsed(
                                !isModelSettingsCollapsed
                              )
                            }
                            disabled={
                              !providerList || providerList.length === 0
                            }
                          >
                            <div
                              className={`i-ph:caret-${isModelSettingsCollapsed ? "right" : "down"} text-sm sm:text-lg flex-shrink-0`}
                            />
                          </IconButton>
                        </div>
                        <ExpoQrModal
                          open={qrModalOpen}
                          onClose={() => setQrModalOpen(false)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center mt-0 mb-2 w-full max-w-chat mx-auto">
                  <button
                    className={classNames(
                      "px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md relative overflow-hidden flex items-center justify-center gap-1 sm:gap-2",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      { "opacity-80": !input.length && !uploadedFiles.length },
                      { "w-full": chatStarted }
                    )}
                    onClick={(event) => {
                      if (isStreaming) {
                        handleStop?.();
                        return;
                      }

                      if (input.length > 0 || uploadedFiles.length > 0) {
                        handleSendMessage?.(event);
                      }
                    }}
                    disabled={!providerList || providerList.length === 0}
                    style={{
                      background: "linear-gradient(90deg, #F2E59F, #07F29C)",
                    }}
                  >
                    <span className="relative z-10 text-black">
                      {isStreaming ? "Stop" : "Generate"}
                    </span>
                    <div className="relative z-10">
                      {isStreaming ? (
                        <div className="i-ph:stop-circle-bold text-base sm:text-lg text-black" />
                      ) : (
                        <div className="i-ph:lightning-bold text-base sm:text-lg text-black" />
                      )}
                    </div>
                    <div
                      className="absolute inset-0 transition-opacity duration-500 ease-in-out opacity-0 hover:opacity-100"
                      style={{
                        background: "linear-gradient(90deg, #07F29C, #F2E59F)",
                      }}
                    />
                  </button>
                </div>
              </div>
            </StickToBottom>
            <div className="flex flex-col justify-center">
              {!chatStarted && (
                <>
                  <div className="text-center text-sm text-gray-500 -mt-3 mb-6"></div>
                  <div className="flex justify-center gap-2">
                    {ImportButtons(importChat)}
                  </div>
                </>
              )}
              <div className="flex flex-col gap-5">
                {!chatStarted &&
                  ExamplePrompts((event, messageInput) => {
                    if (isStreaming) {
                      handleStop?.();
                      return;
                    }

                    handleSendMessage?.(event, messageInput);
                  })}
              </div>
            </div>
          </div>
          <ClientOnly>
            {() => (
              <Suspense fallback={<div>Loading Workbench...</div>}>
                <Workbench
                  actionRunner={actionRunner ?? ({} as ActionRunner)}
                  chatStarted={chatStarted}
                  isStreaming={isStreaming}
                />
              </Suspense>
            )}
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  }
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <button
        className="absolute z-50 top-[0%] translate-y-[-100%] text-4xl rounded-lg left-[50%] translate-x-[-50%] px-1.5 py-0.5 flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-200 text-sm hover:bg-gray-700 transition-colors"
        onClick={() => scrollToBottom()}
      >
        Go to last message
        <span className="i-ph:arrow-down animate-bounce" />
      </button>
    )
  );
}

<svg className={classNames(styles.PromptEffectContainer)}>
  <defs>
    <linearGradient
      id="line-gradient"
      x1="20%"
      y1="0%"
      x2="-14%"
      y2="10%"
      gradientUnits="userSpaceOnUse"
      gradientTransform="rotate(-45)"
    >
      <stop offset="0%" stopColor="#F2E59F" stopOpacity="0%" />
      <stop offset="40%" stopColor="#F2E59F" stopOpacity="80%" />
      <stop offset="50%" stopColor="#07F29C" stopOpacity="80%" />
      <stop offset="100%" stopColor="#07F29C" stopOpacity="0%" />
    </linearGradient>
    <linearGradient id="shine-gradient">
      <stop offset="0%" stopColor="#F2E59F" stopOpacity="0%" />
      <stop offset="40%" stopColor="#F2E59F" stopOpacity="80%" />
      <stop offset="50%" stopColor="#07F29C" stopOpacity="80%" />
      <stop offset="100%" stopColor="#07F29C" stopOpacity="0%" />
    </linearGradient>
  </defs>
  <rect
    className={classNames(styles.PromptEffectLine)}
    pathLength="100"
    strokeLinecap="round"
  />
  <rect
    className={classNames(styles.PromptShine)}
    x="48"
    y="24"
    width="70"
    height="1"
  />
</svg>;
