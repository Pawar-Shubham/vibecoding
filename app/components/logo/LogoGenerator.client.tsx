/*
 * @ts-nocheck
 * Logo Generator Component - Chat interface for iterative logo generation
 */
import { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import { IconButton } from "~/components/ui/IconButton";
import { Button } from "~/components/ui/Button";
import { getApiKeysFromCookies } from "~/components/chat/APIKeyManager";
import { classNames } from "~/utils/classNames";
import { renderLogger } from "~/utils/logger";
import Cookies from "js-cookie";
import * as Tooltip from "@radix-ui/react-tooltip";
import styles from "./LogoGenerator.module.scss";
import { StickToBottom } from "~/lib/hooks/StickToBottom";

interface GeneratedLogo {
  imageData: string;
  description: string;
  mimeType: string;
}

interface UserImage {
  imageData: string;
  fileName: string;
  mimeType: string;
}

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  logo?: GeneratedLogo;
  userImages?: UserImage[]; // For user-uploaded images
  timestamp: Date;
}

const TEXTAREA_MIN_HEIGHT = 76;

const EXAMPLE_PROMPTS = [
  "Create a logo for a tech startup called 'DataFlow' with blue colors and clean typography",
  "Design a coffee shop logo called 'Bean & Brew' with brown and cream colors",
];

export function LogoGenerator() {
  renderLogger.trace("LogoGenerator");

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(
    getApiKeysFromCookies()
  );
  const [pendingImages, setPendingImages] = useState<UserImage[]>([]); // Images to send with next message
  const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] =
    useState(true);
  const [isEditingGemini, setIsEditingGemini] = useState(false);
  const [isEditingGenerative, setIsEditingGenerative] = useState(false);
  const [tempGeminiKey, setTempGeminiKey] = useState("");
  const [tempGenerativeKey, setTempGenerativeKey] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const geminiInputRef = useRef<HTMLInputElement>(null);
  const generativeInputRef = useRef<HTMLInputElement>(null);

  // Handle API key updates
  const updateApiKey = (provider: string, key: string) => {
    const newApiKeys = { ...apiKeys, [provider]: key };
    setApiKeys(newApiKeys);
    Cookies.set("apiKeys", JSON.stringify(newApiKeys));
  };

  // Handle Gemini API key editing
  const handleGeminiSave = () => {
    updateApiKey("GOOGLE_GENERATIVE_AI_API_KEY", tempGeminiKey);
    setIsEditingGemini(false);
  };

  const handleGeminiCancel = () => {
    setIsEditingGemini(false);
    setTempGeminiKey(apiKeys.GOOGLE_GENERATIVE_AI_API_KEY || "");
  };

  const handleGeminiKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleGeminiSave();
    } else if (e.key === "Escape") {
      handleGeminiCancel();
    }
  };

  // Handle Generative API key editing
  const handleGenerativeSave = () => {
    updateApiKey("GENERATIVE_API_KEY", tempGenerativeKey);
    setIsEditingGenerative(false);
  };

  const handleGenerativeCancel = () => {
    setIsEditingGenerative(false);
    setTempGenerativeKey(apiKeys.GENERATIVE_API_KEY || "");
  };

  const handleGenerativeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      handleGenerativeSave();
    } else if (e.key === "Escape") {
      handleGenerativeCancel();
    }
  };

  // Initialize temp keys when apiKeys change
  useEffect(() => {
    setTempGeminiKey(apiKeys.GOOGLE_GENERATIVE_AI_API_KEY || "");
    setTempGenerativeKey(apiKeys.GENERATIVE_API_KEY || "");
  }, [apiKeys]);

  // Focus inputs when editing starts
  useEffect(() => {
    if (isEditingGemini && geminiInputRef.current) {
      geminiInputRef.current.focus();
    }
  }, [isEditingGemini]);

  useEffect(() => {
    if (isEditingGenerative && generativeInputRef.current) {
      generativeInputRef.current.focus();
    }
  }, [isEditingGenerative]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image file`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const base64Data = result.split(",")[1]; // Remove data:image/...;base64, prefix

        const newImage: UserImage = {
          imageData: base64Data,
          fileName: file.name,
          mimeType: file.type,
        };

        setPendingImages((prev) => [...prev, newImage]);
        toast.success(`${file.name} added to chat`);
      };
      reader.readAsDataURL(file);
    });

    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle paste events for images
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    let hasImage = false;

    Array.from(items).forEach((item) => {
      if (item.type.startsWith("image/")) {
        hasImage = true;
        event.preventDefault(); // Prevent default paste behavior for images

        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64Data = result.split(",")[1];

            const newImage: UserImage = {
              imageData: base64Data,
              fileName: `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
              mimeType: file.type,
            };

            setPendingImages((prev) => [...prev, newImage]);
            toast.success(`Image pasted and added to chat`);
          };
          reader.readAsDataURL(file);
        }
      }
    });
  };

  // Remove pending image
  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt for your logo");
      return;
    }

    const geminiApiKey = apiKeys.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!geminiApiKey) {
      toast.error("Please provide your Google Gemini API key");
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: prompt,
      userImages: pendingImages, // Include pending images with the user message
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);
    const currentPrompt = prompt;
    setPrompt(""); // Clear input
    setPendingImages([]); // Clear pending images after sending

    try {
      // Step 1: Optimize prompt with Gemini
      const conversationHistory = messages.map((msg) => ({
        type: msg.type,
        content: msg.content,
      }));

      // Collect all images to send for optimization
      const imagesToSend: Array<{
        imageData: string;
        mimeType: string;
        source: string;
      }> = [];

      // Add user-uploaded images from the current message
      if (pendingImages.length > 0) {
        pendingImages.forEach((image) => {
          imagesToSend.push({
            imageData: image.imageData,
            mimeType: image.mimeType,
            source: `user-reference: ${image.fileName}`,
          });
        });
      }

      // Add the last 2 generated logos for better context (current and previous)
      const generatedLogos = messages
        .filter((m) => m.type === "assistant" && m.logo)
        .slice(-2); // Get last 2 images

      if (generatedLogos.length > 0) {
        // Most recent logo is "current", second most recent is "previous"
        generatedLogos.reverse().forEach((logoMsg, index) => {
          const sourceLabel = index === 0 ? "current-logo" : "previous-logo";
          imagesToSend.push({
            imageData: logoMsg.logo!.imageData,
            mimeType: logoMsg.logo!.mimeType,
            source: sourceLabel,
          });
        });
      }

      const optimizeResponse = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userMessage: currentPrompt,
          conversationHistory: conversationHistory,
          images: imagesToSend,
          apiKey: geminiApiKey,
        }),
      });

      const optimizeData = (await optimizeResponse.json()) as {
        success?: boolean;
        optimizedPrompt?: string;
        error?: string;
      };

      if (!optimizeResponse.ok || !optimizeData.success) {
        // Handle specific error types
        if (optimizeResponse.status === 503) {
          throw new Error(
            "Gemini is currently overloaded. Please wait a moment and try again."
          );
        }
        if (
          optimizeResponse.status === 400 &&
          optimizeData.error?.includes("API key")
        ) {
          throw new Error(
            "Invalid Google Gemini API key. Please check your API key in the settings above."
          );
        }
        throw new Error(optimizeData.error || "Failed to optimize prompt");
      }

      const optimizedPrompt = optimizeData.optimizedPrompt;
      if (!optimizedPrompt) {
        throw new Error("No optimized prompt received");
      }

      console.log("Optimized prompt:", optimizedPrompt);

      // Step 2: Generate logo with Gemini using optimized prompt and images
      const requestBody: any = {
        prompt: optimizedPrompt,
        apiKey: geminiApiKey,
      };

      // Send the same images to the logo generation endpoint
      if (imagesToSend.length > 0) {
        requestBody.images = imagesToSend;
      }

      const response = await fetch("/api/logo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as {
        success?: boolean;
        imageData?: string;
        description?: string;
        mimeType?: string;
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 400 && data.error?.includes("API key")) {
          throw new Error(
            "Invalid Google Gemini API key. Please check your API key in the settings above."
          );
        }
        throw new Error(data.error || "Failed to generate logo");
      }

      if (data.success && data.imageData && data.mimeType) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          content: data.description || "Logo generated successfully!",
          logo: {
            imageData: data.imageData,
            description: data.description || "",
            mimeType: data.mimeType,
          },
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        toast.success("Logo generated successfully!");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Logo generation error:", error);

      let errorMessage = "Failed to generate logo";
      let chatErrorMessage =
        "Sorry, I couldn't generate a logo. Please try again.";

      if (error instanceof Error) {
        errorMessage = error.message;

        // Provide specific chat messages for different error types
        if (error.message.includes("overloaded")) {
          chatErrorMessage =
            "Gemini is currently experiencing high traffic. Please wait a moment and try again. ⏳";
        } else if (error.message.includes("rate limit")) {
          chatErrorMessage =
            "Too many requests. Please wait a few seconds before trying again. ⚡";
        } else if (
          error.message.includes("API key") ||
          error.message.includes("Invalid")
        ) {
          chatErrorMessage =
            "Please check your Google Gemini API key above. Make sure it's valid and has the necessary permissions. 🔑" +
            " " +
            error.message;
        } else if (
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          chatErrorMessage =
            "Network connection issue. Please check your internet and try again. 🌐";
        }
      }

      toast.error(errorMessage);

      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        type: "assistant",
        content: chatErrorMessage,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorChatMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (
    logo: GeneratedLogo,
    format: "png" | "svg" | "tiff" = "png"
  ) => {
    if (!logo) return;

    try {
      // Convert base64 to blob
      const byteCharacters = atob(logo.imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: logo.mimeType });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `generated-logo.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Logo downloaded as ${format.toUpperCase()}`);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download logo");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const MessageComponent = ({ message }: { message: ChatMessage }) => {
    if (message.type === "user") {
      return (
        <div className="flex justify-end mb-4">
          <div className="max-w-xs lg:max-w-md px-4 py-2 bg-blue-600 text-white rounded-lg">
            <p className="text-sm">{message.content}</p>
            {message.userImages && message.userImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.userImages.map((image, index) => (
                  <div key={index}>
                    <img
                      src={`data:${image.mimeType};base64,${image.imageData}`}
                      alt={image.fileName}
                      className="max-w-xs max-h-24 rounded-md shadow-sm"
                      title={image.fileName}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-2xl">
          {message.logo && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-2">
              <img
                src={`data:${message.logo.mimeType};base64,${message.logo.imageData}`}
                alt="Generated Logo"
                className="max-w-full max-h-64 rounded-lg shadow-lg mb-3"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleDownload(message.logo!, "png")}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1"
                >
                  PNG
                </Button>
                <Button
                  onClick={() => handleDownload(message.logo!, "svg")}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1"
                >
                  SVG
                </Button>
                <Button
                  onClick={() => handleDownload(message.logo!, "tiff")}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1"
                >
                  TIFF
                </Button>
              </div>
            </div>
          )}
          <div className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg">
            <p className="text-sm">{message.content}</p>
          </div>
        </div>
      </div>
    );
  };

  const ExamplePrompts = () => {
    return (
      <div
        id="examples"
        className="relative flex flex-col gap-3 lg:gap-6 w-full max-w-3xl mx-auto flex justify-center mt-2 lg:mt-4"
      >
        <div
          className="flex flex-wrap justify-center gap-1 lg:gap-1.5 px-2"
          style={{
            animation: ".25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards",
          }}
        >
          {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
            return (
              <button
                key={index}
                onClick={() => setPrompt(examplePrompt)}
                className="rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-2 lg:px-3 py-0.5 lg:py-1 text-[9px] lg:text-[10px] transition-theme border border-[#e5e7eb] dark:border-transparent whitespace-nowrap"
              >
                {examplePrompt}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="flex flex-col h-full w-full">
        {/* Main Content */}
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 sm:px-6 py-4">
          {messages.length === 0 ? (
            // Centered layout when no messages
            <div className="flex flex-col justify-center items-center h-full">
              {/* BaseChat-style Prompt Box */}
              <div
                className={classNames(
                  styles.MaterialPrompt,
                  "relative w-full max-w-chat mx-auto z-prompt"
                )}
              >
                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 shadow-lg">
                  <div>
                    <div className={isModelSettingsCollapsed ? "hidden" : ""}>
                      {/* API Key Management */}
                      <div className="flex items-center justify-between py-3 px-1">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-bolt-elements-textSecondary">
                              Google Gemini API Key:
                            </span>
                            {!isEditingGemini && (
                              <div className="flex items-center gap-2">
                                {apiKeys.GOOGLE_GENERATIVE_AI_API_KEY ? (
                                  <>
                                    <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                                    <span className="text-xs text-green-500">
                                      Set via UI
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                                    <span className="text-xs text-red-500">
                                      Not Set
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {isEditingGemini ? (
                            <div className="flex items-center gap-2">
                              <input
                                ref={geminiInputRef}
                                type="password"
                                value={tempGeminiKey}
                                placeholder="Enter Google Gemini API Key"
                                onChange={(e) =>
                                  setTempGeminiKey(e.target.value)
                                }
                                onKeyDown={handleGeminiKeyDown}
                                className="w-full sm:w-[250px] md:w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                                          bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                                          focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus
                                          hover:border-bolt-elements-borderColorHover
                                          transition-colors duration-200
                                          cursor-text"
                                autoFocus
                                spellCheck={false}
                                autoComplete="off"
                              />
                              <IconButton
                                onClick={handleGeminiSave}
                                title="Save API Key"
                                className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
                              >
                                <div className="i-ph:check w-4 h-4" />
                              </IconButton>
                              <IconButton
                                onClick={handleGeminiCancel}
                                title="Cancel"
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
                              >
                                <div className="i-ph:x w-4 h-4" />
                              </IconButton>
                            </div>
                          ) : (
                            <>
                              <IconButton
                                onClick={() => setIsEditingGemini(true)}
                                title="Edit API Key"
                                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
                              >
                                <div className="i-ph:pencil-simple w-4 h-4" />
                              </IconButton>
                              {!apiKeys.GOOGLE_GENERATIVE_AI_API_KEY && (
                                <a
                                  href="https://aistudio.google.com/app/apikey"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded text-xs whitespace-nowrap flex items-center gap-2"
                                >
                                  <span>Get Key</span>
                                  <div className="i-ph:key w-4 h-4" />
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Generative API Key */}
                      <div className="flex items-center justify-between py-3 px-1 border-t border-bolt-elements-borderColor">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-bolt-elements-textSecondary">
                              Generative API Key:
                            </span>
                            {!isEditingGenerative && (
                              <div className="flex items-center gap-2">
                                {apiKeys.GENERATIVE_API_KEY ? (
                                  <>
                                    <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                                    <span className="text-xs text-green-500">
                                      Set via UI
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                                    <span className="text-xs text-red-500">
                                      Not Set
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {isEditingGenerative ? (
                            <div className="flex items-center gap-2">
                              <input
                                ref={generativeInputRef}
                                type="password"
                                value={tempGenerativeKey}
                                placeholder="Enter Generative API Key (optional)"
                                onChange={(e) =>
                                  setTempGenerativeKey(e.target.value)
                                }
                                onKeyDown={handleGenerativeKeyDown}
                                className="w-full sm:w-[250px] md:w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                                          bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                                          focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus
                                          hover:border-bolt-elements-borderColorHover
                                          transition-colors duration-200
                                          cursor-text"
                                autoFocus
                                spellCheck={false}
                                autoComplete="off"
                              />
                              <IconButton
                                onClick={handleGenerativeSave}
                                title="Save API Key"
                                className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
                              >
                                <div className="i-ph:check w-4 h-4" />
                              </IconButton>
                              <IconButton
                                onClick={handleGenerativeCancel}
                                title="Cancel"
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
                              >
                                <div className="i-ph:x w-4 h-4" />
                              </IconButton>
                            </div>
                          ) : (
                            <IconButton
                              onClick={() => setIsEditingGenerative(true)}
                              title="Edit API Key"
                              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
                            >
                              <div className="i-ph:pencil-simple w-4 h-4" />
                            </IconButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pending Images Display */}
                  {pendingImages.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Images to send ({pendingImages.length})
                        </h4>
                        <button
                          onClick={() => setPendingImages([])}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pendingImages.map((image, index) => (
                          <div key={index} className="relative">
                            <img
                              src={`data:${image.mimeType};base64,${image.imageData}`}
                              alt={image.fileName}
                              className="w-16 h-16 object-cover rounded-md border border-gray-300 dark:border-gray-600"
                              title={image.fileName}
                            />
                            <button
                              onClick={() => removePendingImage(index)}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                              title="Remove image"
                            >
                              ✗
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="relative backdrop-blur">
                    <textarea
                      ref={textareaRef}
                      className="w-full pl-4 pt-4 pr-4 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm"
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
                              const base64Data = base64Image.split(",")[1];
                              const newImage: UserImage = {
                                imageData: base64Data,
                                fileName: file.name,
                                mimeType: file.type,
                              };
                              setPendingImages((prev) => [...prev, newImage]);
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

                          if (isGenerating) {
                            return;
                          }

                          // ignore if using input method engine
                          if (event.nativeEvent.isComposing) {
                            return;
                          }

                          handleGenerate();
                        }
                      }}
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onPaste={handlePaste}
                      style={{
                        minHeight: TEXTAREA_MIN_HEIGHT,
                        maxHeight: "200px",
                      }}
                      placeholder="Describe your logo idea..."
                      translate="no"
                    />
                    <div className="flex justify-between items-center text-sm p-4 pt-2">
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {prompt.length > 3 ? (
                          <div className="text-xs text-bolt-elements-textTertiary">
                            Use{" "}
                            <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                              Shift
                            </kbd>{" "}
                            +{" "}
                            <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                              Return
                            </kbd>{" "}
                            for new line
                          </div>
                        ) : null}
                      </div>

                      <div className="flex gap-1 sm:gap-2 items-center ml-auto">
                        <IconButton
                          title="Upload file"
                          className="transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="i-ph:paperclip text-lg sm:text-xl flex-shrink-0"></div>
                        </IconButton>
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
                        >
                          <div
                            className={`i-ph:caret-${isModelSettingsCollapsed ? "right" : "down"} text-sm sm:text-lg flex-shrink-0`}
                          />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-4 mb-2 w-full max-w-chat mx-auto">
                <button
                  className={classNames(
                    "px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md relative overflow-hidden flex items-center justify-center gap-1 sm:gap-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    { "opacity-80": !prompt.length && !pendingImages.length }
                  )}
                  onClick={() => {
                    if (isGenerating) {
                      return;
                    }

                    if (prompt.length > 0 || pendingImages.length > 0) {
                      handleGenerate();
                    }
                  }}
                  disabled={!apiKeys.GOOGLE_GENERATIVE_AI_API_KEY}
                  style={{
                    background: "linear-gradient(90deg, #F2E59F, #07F29C)",
                  }}
                >
                  <span className="relative z-10 text-black">
                    {isGenerating ? "Generating..." : "Generate Logo"}
                  </span>
                  <div className="relative z-10">
                    {isGenerating ? (
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

              <div className="flex flex-col justify-center mt-4">
                <div className="flex flex-col gap-5">
                  <ExamplePrompts />
                </div>
              </div>
            </div>
          ) : (
            // Chat layout when messages exist
            <StickToBottom>
              <div className="flex flex-col h-full">
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto mb-4 min-h-0">
                  <div className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <MessageComponent key={message.id} message={message} />
                      ))}
                      {isGenerating && (
                        <div className="flex justify-start mb-4">
                          <div className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg">
                            <p className="text-sm">
                              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></span>
                              Automatically optimizing prompt and generating
                              logo...
                            </p>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                </div>

                {/* BaseChat-style Prompt Box */}
                <div className="w-full max-w-chat mx-auto z-prompt mb-6">
                  <div
                    className={classNames(
                      styles.MaterialPrompt,
                      "relative w-full"
                    )}
                  >
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-3 shadow-lg">
                      <div>
                        <div
                          className={isModelSettingsCollapsed ? "hidden" : ""}
                        >
                          {/* API Key Management */}
                          <div className="flex items-center justify-between py-3 px-1">
                            <div className="flex items-center gap-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-bolt-elements-textSecondary">
                                  Google Gemini API Key:
                                </span>
                                {!isEditingGemini && (
                                  <div className="flex items-center gap-2">
                                    {apiKeys.GOOGLE_GENERATIVE_AI_API_KEY ? (
                                      <>
                                        <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                                        <span className="text-xs text-green-500">
                                          Set via UI
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                                        <span className="text-xs text-red-500">
                                          Not Set
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {isEditingGemini ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    ref={geminiInputRef}
                                    type="password"
                                    value={tempGeminiKey}
                                    placeholder="Enter Google Gemini API Key"
                                    onChange={(e) =>
                                      setTempGeminiKey(e.target.value)
                                    }
                                    onKeyDown={handleGeminiKeyDown}
                                    className="w-full sm:w-[250px] md:w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                                            bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                                            focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus
                                            hover:border-bolt-elements-borderColorHover
                                            transition-colors duration-200
                                            cursor-text"
                                    autoFocus
                                    spellCheck={false}
                                    autoComplete="off"
                                  />
                                  <IconButton
                                    onClick={handleGeminiSave}
                                    title="Save API Key"
                                    className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
                                  >
                                    <div className="i-ph:check w-4 h-4" />
                                  </IconButton>
                                  <IconButton
                                    onClick={handleGeminiCancel}
                                    title="Cancel"
                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
                                  >
                                    <div className="i-ph:x w-4 h-4" />
                                  </IconButton>
                                </div>
                              ) : (
                                <>
                                  <IconButton
                                    onClick={() => setIsEditingGemini(true)}
                                    title="Edit API Key"
                                    className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
                                  >
                                    <div className="i-ph:pencil-simple w-4 h-4" />
                                  </IconButton>
                                  {!apiKeys.GOOGLE_GENERATIVE_AI_API_KEY && (
                                    <a
                                      href="https://aistudio.google.com/app/apikey"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded text-xs whitespace-nowrap flex items-center gap-2"
                                    >
                                      <span>Get Key</span>
                                      <div className="i-ph:key w-4 h-4" />
                                    </a>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Generative API Key */}
                          <div className="flex items-center justify-between py-3 px-1 border-t border-bolt-elements-borderColor">
                            <div className="flex items-center gap-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-bolt-elements-textSecondary">
                                  Generative API Key:
                                </span>
                                {!isEditingGenerative && (
                                  <div className="flex items-center gap-2">
                                    {apiKeys.GENERATIVE_API_KEY ? (
                                      <>
                                        <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                                        <span className="text-xs text-green-500">
                                          Set via UI
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                                        <span className="text-xs text-red-500">
                                          Not Set
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {isEditingGenerative ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    ref={generativeInputRef}
                                    type="password"
                                    value={tempGenerativeKey}
                                    placeholder="Enter Generative API Key (optional)"
                                    onChange={(e) =>
                                      setTempGenerativeKey(e.target.value)
                                    }
                                    onKeyDown={handleGenerativeKeyDown}
                                    className="w-full sm:w-[250px] md:w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                                            bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                                            focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus
                                            hover:border-bolt-elements-borderColorHover
                                            transition-colors duration-200
                                            cursor-text"
                                    autoFocus
                                    spellCheck={false}
                                    autoComplete="off"
                                  />
                                  <IconButton
                                    onClick={handleGenerativeSave}
                                    title="Save API Key"
                                    className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
                                  >
                                    <div className="i-ph:check w-4 h-4" />
                                  </IconButton>
                                  <IconButton
                                    onClick={handleGenerativeCancel}
                                    title="Cancel"
                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
                                  >
                                    <div className="i-ph:x w-4 h-4" />
                                  </IconButton>
                                </div>
                              ) : (
                                <IconButton
                                  onClick={() => setIsEditingGenerative(true)}
                                  title="Edit API Key"
                                  className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
                                >
                                  <div className="i-ph:pencil-simple w-4 h-4" />
                                </IconButton>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pending Images Display */}
                      {pendingImages.length > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Images to send ({pendingImages.length})
                            </h4>
                            <button
                              onClick={() => setPendingImages([])}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {pendingImages.map((image, index) => (
                              <div key={index} className="relative">
                                <img
                                  src={`data:${image.mimeType};base64,${image.imageData}`}
                                  alt={image.fileName}
                                  className="w-16 h-16 object-cover rounded-md border border-gray-300 dark:border-gray-600"
                                  title={image.fileName}
                                />
                                <button
                                  onClick={() => removePendingImage(index)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                                  title="Remove image"
                                >
                                  ✗
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="relative backdrop-blur">
                        <textarea
                          ref={textareaRef}
                          className="w-full pl-4 pt-4 pr-4 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm"
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
                                  const base64Image = e.target
                                    ?.result as string;
                                  const base64Data = base64Image.split(",")[1];
                                  const newImage: UserImage = {
                                    imageData: base64Data,
                                    fileName: file.name,
                                    mimeType: file.type,
                                  };
                                  setPendingImages((prev) => [
                                    ...prev,
                                    newImage,
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

                              if (isGenerating) {
                                return;
                              }

                              // ignore if using input method engine
                              if (event.nativeEvent.isComposing) {
                                return;
                              }

                              handleGenerate();
                            }
                          }}
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          onPaste={handlePaste}
                          style={{
                            minHeight: TEXTAREA_MIN_HEIGHT,
                            maxHeight: "200px",
                          }}
                          placeholder="Ask for changes or describe a new logo..."
                          translate="no"
                        />
                        <div className="flex justify-between items-center text-sm p-4 pt-2">
                          <div className="flex-shrink-0 flex items-center gap-2">
                            {prompt.length > 3 ? (
                              <div className="text-xs text-bolt-elements-textTertiary">
                                Use{" "}
                                <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                                  Shift
                                </kbd>{" "}
                                +{" "}
                                <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">
                                  Return
                                </kbd>{" "}
                                for new line
                              </div>
                            ) : null}
                          </div>

                          <div className="flex gap-1 sm:gap-2 items-center ml-auto">
                            <IconButton
                              title="Upload file"
                              className="transition-all p-2 sm:p-2.5 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <div className="i-ph:paperclip text-lg sm:text-xl flex-shrink-0"></div>
                            </IconButton>
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
                            >
                              <div
                                className={`i-ph:caret-${isModelSettingsCollapsed ? "right" : "down"} text-sm sm:text-lg flex-shrink-0`}
                              />
                            </IconButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center mt-0 mb-2 w-full max-w-chat mx-auto">
                    <button
                      className={classNames(
                        "px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md relative overflow-hidden flex items-center justify-center gap-1 sm:gap-2",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        {
                          "opacity-80": !prompt.length && !pendingImages.length,
                        },
                        { "w-full": messages.length > 0 }
                      )}
                      onClick={() => {
                        if (isGenerating) {
                          return;
                        }

                        if (prompt.length > 0 || pendingImages.length > 0) {
                          handleGenerate();
                        }
                      }}
                      disabled={!apiKeys.GOOGLE_GENERATIVE_AI_API_KEY}
                      style={{
                        background: "linear-gradient(90deg, #F2E59F, #07F29C)",
                      }}
                    >
                      <span className="relative z-10 text-black">
                        {isGenerating ? "Generating..." : "Generate Logo"}
                      </span>
                      <div className="relative z-10">
                        {isGenerating ? (
                          <div className="i-ph:stop-circle-bold text-base sm:text-lg text-black" />
                        ) : (
                          <div className="i-ph:lightning-bold text-base sm:text-lg text-black" />
                        )}
                      </div>
                      <div
                        className="absolute inset-0 transition-opacity duration-500 ease-in-out opacity-0 hover:opacity-100"
                        style={{
                          background:
                            "linear-gradient(90deg, #07F29C, #F2E59F)",
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </StickToBottom>
          )}

          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
            Press Enter to send • Auto-optimization + generation • Latest
            changes override previous ones • Try: "make it brighter", "change to
            blue color", "use elegant font" • Add reference images with 📎 or
            paste directly
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    </Tooltip.Provider>
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
