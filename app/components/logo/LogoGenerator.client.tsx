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

export function LogoGenerator() {
  renderLogger.trace("LogoGenerator");

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(
    getApiKeysFromCookies()
  );
  const [pendingImages, setPendingImages] = useState<UserImage[]>([]); // Images to send with next message
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle API key updates
  const updateApiKey = (provider: string, key: string) => {
    const newApiKeys = { ...apiKeys, [provider]: key };
    setApiKeys(newApiKeys);
    Cookies.set("apiKeys", JSON.stringify(newApiKeys));
  };

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
        <div className="max-w-2xl">
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

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Logo Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Create and iterate on logos using AI. Ask for changes and
            improvements to refine your design.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-4">
        {/* API Keys */}
        <div className="mb-6">
          {/* Google Gemini API Key */}
          <div>
            <label
              htmlFor="gemini-api-key"
              className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
            >
              Google Gemini API Key
            </label>
            <div className="flex gap-2">
              <input
                id="gemini-api-key"
                type="password"
                value={apiKeys.GOOGLE_GENERATIVE_AI_API_KEY || ""}
                onChange={(e) =>
                  updateApiKey("GOOGLE_GENERATIVE_AI_API_KEY", e.target.value)
                }
                placeholder="Enter your Google Gemini API key"
                className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                Get Key
              </a>
            </div>
            {!apiKeys.GOOGLE_GENERATIVE_AI_API_KEY && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Your API key is used for logo generation. Prompt optimization is
                handled automatically.
              </p>
            )}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Welcome to Logo Generator
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Describe your logo idea to get started. Your prompts are
                  automatically optimized and latest changes are prioritized,
                  then Gemini generates the perfect logo. You can iterate with
                  requests like "make it more colorful" or "change the font
                  style"! Add reference images by clicking 📎 or pasting
                  directly into the chat.
                </p>
                <div className="grid grid-cols-1 gap-3 max-w-md">
                  {examplePrompts.map((example, index) => (
                    <button
                      key={index}
                      className="p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => setPrompt(example)}
                    >
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {example}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageComponent key={message.id} message={message} />
              ))}
              {isGenerating && (
                <div className="flex justify-start mb-4">
                  <div className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg">
                    <p className="text-sm">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></span>
                      Automatically optimizing prompt and generating logo...
                    </p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
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

          <div className="flex gap-2">
            <div className="flex flex-col flex-1">
              <div className="flex gap-2 mb-2">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
                  placeholder={
                    messages.length === 0
                      ? "Describe your logo idea..."
                      : "Ask for changes or describe a new logo..."
                  }
                  className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isGenerating}
                  rows={2}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4"
                  title="Add images"
                >
                  📎
                </Button>
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6"
            >
              {isGenerating ? "..." : "Send"}
            </Button>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Press Ctrl+Enter to send • Auto-optimization + generation • Latest
            changes override previous ones • Try: "make it brighter", "change to
            blue color", "use elegant font" • Add reference images with 📎 or
            paste directly
          </p>
        </div>
      </div>
    </div>
  );
}

const examplePrompts = [
  "Create a logo for a tech startup called 'DataFlow' with blue colors and clean typography",
  "Design a coffee shop logo called 'Bean & Brew' with brown and cream colors",
  "Make a gaming logo 'PixelForce' with red and black colors, bold font",
  "Create a fitness app logo 'FitTrack' with green colors and modern style",
];
