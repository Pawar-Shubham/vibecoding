/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams, useLocation } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { useAuth } from '~/lib/hooks/useAuth';
import { AuthModal } from '../auth/AuthModal';
import { LoadingScreen } from '../ui/LoadingScreen';
import { useMinimumLoadingTime } from '~/lib/hooks/useMinimumLoadingTime';
import { stopNavigationLoading } from '~/lib/stores/navigation';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  const location = useLocation();
  
  // Use minimum loading time to ensure smooth UX
  const shouldShowLoading = useMinimumLoadingTime(!ready, 1500);
  
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  // Stop navigation loading when chat is ready
  useEffect(() => {
    if (ready) {
      stopNavigationLoading();
    }
  }, [ready]);

  // Show loading state while chat is being loaded
  if (shouldShowLoading) {
    return <LoadingScreen />;
  }
  
  // If we're on a chat URL but have no messages and ready is true, show a fallback
  if (ready && location.pathname.startsWith('/chat/') && initialMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 dark:text-white">Chat not found</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This chat may have been deleted or you may not have access to it.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatImpl
        description={title}
        initialMessages={initialMessages}
        exportChat={exportChat}
        storeMessageHistory={storeMessageHistory}
        importChat={importChat}
      />
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
        autoClose={3000}
      />
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const { isAuthenticated } = useAuth();
    const files = useStore(workbenchStore.files);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();

    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
    });

    const { showChat } = useStore(chatStore);

    const [animationScope, animate] = useAnimate();

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        supabase: {
          isConnected: supabaseConn.isConnected,
          hasSelectedProject: !!selectedProject,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
        },
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        logger.error('Request failed\n\n', e, error);
        logStore.logError('Chat request failed', e, {
          component: 'Chat',
          action: 'request',
          error: e.message,
        });
        toast.error(
          'There was an error processing your request: ' + (e.message ? e.message : 'No details were returned'),
        );
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
        streamingState.set(false);
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    // Update streaming state when loading changes
    useEffect(() => {
      streamingState.set(isLoading);
    }, [isLoading]);

    // Reset chat state when initialMessages change (switching between chats)
    useEffect(() => {
      if (initialMessages.length > 0) {
        setChatStarted(true);
        chatStore.setKey('started', true);
        // Reset the messages to the new chat's messages
        setMessages(initialMessages);
        // Clear any ongoing streaming
        if (isLoading) {
          stop();
        }
        // Clear input
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        // Reset any file uploads
        setUploadedFiles([]);
        setImageDataList([]);
        // Update workbench with reloaded messages
        workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
        // Reset any ongoing actions
        workbenchStore.abortAllActions();
        // Clear any alerts
        workbenchStore.clearAlert();
        workbenchStore.clearSupabaseAlert();
        workbenchStore.clearDeployAlert();
      } else {
        // Reset to initial state when no messages
        setChatStarted(false);
        chatStore.setKey('started', false);
        setMessages([]);
        // Reset UI to show intro - check if elements exist first
        const introElement = document.querySelector('#intro');
        const examplesElement = document.querySelector('#examples');
        
        if (introElement) {
          animate('#intro', { opacity: 1, flex: 0, y: 0 }, { duration: 0.2 });
        }
        if (examplesElement) {
          animate('#examples', { opacity: 1, display: 'flex', y: 0 }, { duration: 0.2 });
        }
        // Clear workbench state
        workbenchStore.resetAllFileModifications();
        workbenchStore.setDocuments({});
        workbenchStore.clearAlert();
        workbenchStore.clearSupabaseAlert();
        workbenchStore.clearDeployAlert();
      }
    }, [initialMessages, animate, setMessages, stop, setInput]);

    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
            },
          ] as any, // Type assertion to bypass compiler check
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    // Handle browser navigation (back/forward) and ensure proper state management
    useEffect(() => {
      const handlePopState = (event: PopStateEvent) => {
        const currentPath = window.location.pathname;
        console.log('Navigation detected:', currentPath);
        
        // If navigating back to the homepage, reset chat state
        if (currentPath === '/') {
          console.log('Resetting chat state for homepage navigation');
          setChatStarted(false);
          chatStore.setKey('started', false);
          // Reset messages if we have active messages
          if (messages.length > 0) {
            setMessages([]);
          }
          // Clear any ongoing operations
          if (isLoading) {
            stop();
          }
          // Clear input and cookies
          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          // Reset file uploads
          setUploadedFiles([]);
          setImageDataList([]);
          // Clear workbench state
          workbenchStore.resetAllFileModifications();
          workbenchStore.setDocuments({});
          workbenchStore.clearAlert();
          workbenchStore.clearSupabaseAlert();
          workbenchStore.clearDeployAlert();
        }
      };

      // Listen for browser navigation events
      window.addEventListener('popstate', handlePopState);

      // Handle initial page load for chat URLs - detect reload scenarios
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/chat/') && initialMessages.length === 0) {
        console.log('Chat URL detected on reload:', currentPath);
        
        // Extract chat ID from URL
        const chatId = currentPath.split('/chat/')[1];
        if (chatId) {
          console.log('Attempting to load chat:', chatId);
          // Don't redirect to homepage - let the useChatHistory hook handle the loading
          // The chat should either load successfully or show an appropriate error
        }
      }

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }, [messages.length, isLoading, initialMessages.length]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      // Check if elements exist before animating to prevent framer-motion errors
      const examplesElement = document.querySelector('#examples');
      const introElement = document.querySelector('#intro');

      const animations = [];
      
      if (examplesElement) {
        animations.push(animate('#examples', { opacity: 0, display: 'none', y: 0 }, { duration: 0.1 }));
      }
      
      if (introElement) {
        animations.push(animate('#intro', { opacity: 0, flex: 0, y: 0 }, { duration: 0.2, ease: cubicEasingFn }));
      }

      if (animations.length > 0) {
        await Promise.all(animations);
      }

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      // Only check authentication if this is not coming from a post-auth flow
      // The BaseChat component handles pre-auth prompt storage and modal triggering
      if (!isAuthenticated && !messageInput) {
        // If no messageInput is provided, it means this is a direct user action
        // BaseChat will handle the auth flow, so we just return
        return;
      }

      if (isLoading) {
        abort();
        return;
      }

      // If no locked items, proceed normally with the original message
      const finalMessageContent = messageContent;

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
                    },
                    ...imageDataList.map((imageData) => ({
                      type: 'image',
                      image: imageData,
                    })),
                  ] as any,
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);
              reload();
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
              },
              ...imageDataList.map((imageData) => ({
                type: 'image',
                image: imageData,
              })),
            ] as any,
          },
        ]);
        reload();
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });

        workbenchStore.resetAllFileModifications();
      } else {
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    useEffect(() => {
      const handleGeneratePrompt = (event: CustomEvent) => {
        const { prompt } = event.detail;
        if (prompt) {
          setInput(prompt);
          // Trigger the send message - this bypasses auth check since it comes from successful auth
          sendMessage({} as React.UIEvent, prompt);
        }
      };

      window.addEventListener('generate-prompt', handleGeneratePrompt as EventListener);
      return () => {
        window.removeEventListener('generate-prompt', handleGeneratePrompt as EventListener);
      };
    }, [sendMessage]);

    return (
      <>
        <BaseChat
          ref={animationScope}
          textareaRef={textareaRef}
          input={input}
          showChat={showChat}
          chatStarted={chatStarted}
          isStreaming={isLoading || fakeLoading}
          onStreamingChange={(streaming) => {
            streamingState.set(streaming);
          }}
          enhancingPrompt={enhancingPrompt}
          promptEnhanced={promptEnhanced}
          sendMessage={sendMessage}
          model={model}
          setModel={handleModelChange}
          provider={provider}
          setProvider={handleProviderChange}
          providerList={activeProviders}
          handleInputChange={(e) => {
            onTextareaChange(e);
            debouncedCachePrompt(e);
          }}
          handleStop={abort}
          description={description}
          importChat={importChat}
          exportChat={exportChat}
          messages={messages.map((message, i) => {
            if (message.role === 'user') {
              return message;
            }

            return {
              ...message,
              content: parsedMessages[i] || '',
            };
          })}
          enhancePrompt={() => {
            enhancePrompt(
              input,
              (input) => {
                setInput(input);
                scrollTextArea();
              },
              model,
              provider,
              apiKeys,
            );
          }}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          imageDataList={imageDataList}
          setImageDataList={setImageDataList}
          actionAlert={actionAlert}
          clearAlert={() => workbenchStore.clearAlert()}
          supabaseAlert={supabaseAlert}
          clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
          deployAlert={deployAlert}
          clearDeployAlert={() => workbenchStore.clearDeployAlert()}
          data={chatData}
          auth={isAuthenticated}
        />
      </>
    );
  },
);
