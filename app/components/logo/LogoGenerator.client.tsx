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
import { ClientOnly } from "remix-utils/client-only";

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
  "Design a minimalist restaurant logo with elegant typography",
  "Create a playful children's toy brand logo with bright colors",
];

// Rotating placeholder texts
const ROTATING_PLACEHOLDERS = [
  "Press Enter to send",
  "Auto-optimization + generation",
  "Latest changes override previous ones",
  'Try: "make it brighter", "change to blue color", "use elegant font"',
  "Add reference images with 📎 or paste directly",
];

interface LogoGeneratorProps {
  onMessagesChange?: (hasMessages: boolean) => void;
}

export function LogoGenerator({ onMessagesChange }: LogoGeneratorProps) {
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
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [isPlaceholderTransitioning, setIsPlaceholderTransitioning] =
    useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const geminiInputRef = useRef<HTMLInputElement>(null);
  const generativeInputRef = useRef<HTMLInputElement>(null);

  // Rotate placeholder text every 3 seconds with smooth transition
  useEffect(() => {
    const interval = setInterval(() => {
      setIsPlaceholderTransitioning(true);

      // Wait for fade out, then change text
      setTimeout(() => {
        setCurrentPlaceholderIndex(
          (prev) => (prev + 1) % ROTATING_PLACEHOLDERS.length
        );
        setIsPlaceholderTransitioning(false);
      }, 150); // Half of the total transition time
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Notify parent when messages change
  useEffect(() => {
    onMessagesChange?.(messages.length > 0);
  }, [messages.length, onMessagesChange]);

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

  // Component for individual messages - displayed in left chat area
  const MessageComponent = ({ message }: { message: ChatMessage }) => {
    const isUserMessage = message.type === "user";

    return (
      <div
        className={classNames(
          "flex gap-4 p-6 py-5 w-full rounded-[calc(0.75rem-1px)]",
          {
            "bg-white dark:bg-gray-900": true,
            "mt-4": true,
          }
        )}
      >
        {isUserMessage && (
          <div className="flex items-center justify-center w-[40px] h-[40px] overflow-hidden rounded-full shrink-0 self-start">
            <div className="w-full h-full flex items-center justify-center rounded-full bg-accent-600 text-white font-medium">
              U
            </div>
          </div>
        )}
        <div className="grid grid-col-1 w-full">
          {isUserMessage ? (
            <div className="overflow-hidden pt-[4px]">
              <div className="text-sm text-gray-900 dark:text-white">
                {message.content}
              </div>
              {/* User reference images */}
              {message.userImages && message.userImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {message.userImages.map((img, index) => (
                    <div key={index} className="relative inline-block">
                      <img
                        src={`data:${img.mimeType};base64,${img.imageData}`}
                        alt={img.fileName}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="absolute top-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                        {img.fileName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden w-full">
              <div className="text-sm text-gray-900 dark:text-white">
                {message.content}
              </div>
              {/* Show logo generation indicator for assistant messages with logos */}
              {message.logo && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-2 text-xs opacity-75 text-gray-600 dark:text-gray-400">
                    <div className="i-ph:palette" />
                    <span>Logo generated - view in sidebar →</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const ExamplePrompts = () => {
    return (
      <div
        id="examples"
        className="relative flex flex-col gap-4 lg:gap-9 w-full max-w-3xl mx-auto flex justify-center mt-3 lg:mt-6"
      >
        {/* Regular Example Prompts */}
        <div
          className="flex flex-wrap justify-center gap-1.5 lg:gap-2 px-2"
          style={{
            animation: ".25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards",
          }}
        >
          {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
            return (
              <button
                key={index}
                onClick={() => setPrompt(examplePrompt)}
                className="rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-3 lg:px-4 py-1 lg:py-1.5 text-[10px] lg:text-xs transition-theme border border-[#e5e7eb] dark:border-transparent whitespace-nowrap"
              >
                {examplePrompt}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Logo Workbench Component - Right sidebar for generated logos (matches main chat workbench)
  const LogoWorkbench = ({
    messages,
    chatStarted,
  }: {
    messages: ChatMessage[];
    chatStarted: boolean;
  }) => {
    if (!chatStarted) return null;

    const logoMessages = messages.filter(
      (message) => message.type === "assistant" && message.logo
    );

    return (
      <div className="fixed top-[calc(var(--header-height)+1.5rem)] bottom-6 w-[var(--workbench-inner-width)] mr-4 z-10 transition-[left,width] duration-200 bolt-ease-cubic-bezier left-[var(--workbench-left)]">
        <div className="absolute inset-0 px-2 lg:px-6">
          <div className="h-full flex flex-col bg-white dark:bg-[#1a1a1a] border border-gray-200/30 dark:border-gray-800/30 shadow-sm rounded-lg">
            <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor bg-white dark:bg-[#1a1a1a] gap-1">
              <div className="flex items-center gap-2">
                <div className="i-ph:palette text-lg text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Generated Logos
                </h3>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {logoMessages.length} generated
                </div>
              </div>
            </div>
            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-y-auto p-4 relative z-20 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {logoMessages.map((message, index) => (
                  <div key={message.id} className="mb-6">
                    {/* Logo Container */}
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {/* Logo Display */}
                      <div className="p-4">
                        <img
                          src={`data:${message.logo?.mimeType};base64,${message.logo?.imageData}`}
                          alt="Generated logo"
                          className="w-full h-auto max-h-64 object-contain"
                        />
                      </div>

                      {/* Download Buttons for this specific logo */}
                      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <div className="flex gap-2">
                          <button
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                            onClick={() => handleDownload(message.logo!, "png")}
                          >
                            📥 PNG
                          </button>

                          <button
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                            onClick={() => handleDownload(message.logo!, "svg")}
                          >
                            📥 SVG
                          </button>

                          <button
                            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
                            onClick={() =>
                              handleDownload(message.logo!, "tiff")
                            }
                          >
                            📥 TIFF
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {logoMessages.length === 0 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 mt-16">
                    <div className="i-ph:palette text-6xl mb-4 mx-auto opacity-30" />
                    <h4 className="text-lg font-medium mb-2">No logos yet</h4>
                    <p className="text-sm">
                      Start a conversation to generate your first logo!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const baseChat = (
    <div
      className={classNames(
        styles.BaseChat,
        "relative flex h-full w-full overflow-hidden"
      )}
    >
      {/* Background animations matching BaseChat */}
      <div className="fixed inset-0 w-screen h-screen pointer-events-none overflow-hidden -z-[1]">
        <div
          className="absolute rounded-[50%] blur-[150px] mix-blend-soft-light"
          style={{
            width: "800px",
            height: "800px",
            background:
              "radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, rgba(7, 242, 156, 0.1) 60%, rgba(242, 229, 159, 0.08) 100%)",
            animation: "roamOrb1 30s infinite ease-in-out",
          }}
        />
        <div
          className="absolute rounded-[50%] blur-[150px] mix-blend-soft-light"
          style={{
            width: "900px",
            height: "900px",
            background:
              "radial-gradient(circle, rgba(6, 182, 212, 0.18) 0%, rgba(56, 189, 248, 0.12) 40%, rgba(7, 242, 156, 0.08) 100%)",
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

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
        {/* Chat Section - Always visible on left side */}
        <div
          className={classNames(
            styles.Chat,
            "flex flex-col flex-grow h-full",
            // Adjust width based on whether workbench is active
            messages.filter((msg) => msg.type === "assistant" && msg.logo)
              .length > 0
              ? "lg:w-[calc(100%-48rem)]"
              : "w-full"
          )}
        >
          {messages.length === 0 && (
            <div
              id="intro"
              className="mt-[8vh] lg:mt-[13.5vh] w-full max-w-3xl mx-auto text-center px-4 lg:px-0 mb-4"
            >
              <h1 className="text-2xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-1 lg:mb-2 animate-fade-in flex items-center justify-center gap-2">
                <span className="text-2xl lg:text-5xl flex items-center gap-0">
                  Create stunning logos with{" "}
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
                design that speaks your{" "}
                <span className="text-black dark:text-white">brand</span>.
              </p>
            </div>
          )}
          <StickToBottom
            className={classNames("pt-2 px-4 sm:px-8 relative", {
              "h-full flex flex-col": messages.length > 0,
            })}
            resize="smooth"
            initial="smooth"
          >
            <StickToBottom.Content className="flex flex-col h-full">
              <ClientOnly>
                {() => {
                  return messages.length > 0 ? (
                    <div
                      className={classNames(
                        "flex flex-col w-full overflow-y-auto modern-scrollbar-dark-grey min-h-0",
                        {
                          "max-w-lg": messages.length > 0,
                          "max-w-full": messages.length === 0,
                        }
                      )}
                    >
                      {messages.map((message) => (
                        <MessageComponent key={message.id} message={message} />
                      ))}
                      {isGenerating && (
                        <div className="text-center w-full text-bolt-elements-item-contentAccent i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
                      )}
                    </div>
                  ) : null;
                }}
              </ClientOnly>
            </StickToBottom.Content>
            <div
              className={classNames(
                "flex flex-col gap-2 w-full z-prompt mb-6",
                {
                  "sticky bottom-2 px-2 lg:px-4 max-w-lg": messages.length > 0,
                  "max-w-chat mx-auto": messages.length === 0,
                }
              )}
            >
              <div className="flex flex-col gap-2"></div>
              {/* Prompt Box */}
              <div
                className={classNames(
                  styles.MaterialPrompt,
                  "relative w-full z-prompt",
                  {
                    "max-w-lg": messages.length > 0,
                    "max-w-chat mx-auto": messages.length === 0,
                  }
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
                        className={classNames(
                          "w-full pl-4 pt-4 pr-4 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm",
                          {
                            "transition-opacity duration-300 ease-in-out opacity-50":
                              isPlaceholderTransitioning,
                          }
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
                        placeholder={
                          ROTATING_PLACEHOLDERS[currentPlaceholderIndex]
                        }
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
              </div>

              {/* Generate Button - At the bottom */}
              <div
                className={classNames("flex justify-center mt-2 w-full", {
                  "max-w-lg": messages.length > 0,
                  "max-w-chat mx-auto": messages.length === 0,
                })}
              >
                <button
                  className={classNames(
                    "px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md relative overflow-hidden flex items-center justify-center gap-1 sm:gap-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    { "opacity-80": !prompt.length && !pendingImages.length },
                    messages.length > 0 ? "w-full" : ""
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
                    minHeight: "40px",
                  }}
                >
                  <span className="relative z-10 text-black">
                    {isGenerating ? "Stop" : "Generate"}
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
            </div>
          </StickToBottom>
          <div className="flex flex-col justify-center">
            {messages.length === 0 && (
              <>
                <div className="text-center text-sm text-gray-500 -mt-3 mb-6"></div>
              </>
            )}
            <div className="flex flex-col gap-5">
              {messages.length === 0 && <ExamplePrompts />}
            </div>
          </div>
        </div>

        {/* Logo Preview Section - Workbench Style - Only shows when logos exist */}
        <ClientOnly>
          {() =>
            messages.filter((msg) => msg.type === "assistant" && msg.logo)
              .length > 0 && (
              <LogoWorkbench messages={messages} chatStarted={true} />
            )
          }
        </ClientOnly>
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
  );

  return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
}
