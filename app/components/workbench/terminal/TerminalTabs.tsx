import { useStore } from "@nanostores/react";
import React, { memo, useEffect, useRef, useState } from "react";
import { Panel, type ImperativePanelHandle } from "react-resizable-panels";
import { IconButton } from "~/components/ui/IconButton";
import { shortcutEventEmitter } from "~/lib/hooks";
import { themeStore } from "~/lib/stores/theme";
import { workbenchStore } from "~/lib/stores/workbench";
import { classNames } from "~/utils/classNames";
import { Terminal, type TerminalRef } from "./Terminal";
import { createScopedLogger } from "~/utils/logger";

const logger = createScopedLogger("Terminal");

const MAX_TERMINALS = 3;
export const DEFAULT_TERMINAL_SIZE = 25;

export const TerminalTabs = memo(() => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);

  const terminalRefs = useRef<Map<number, TerminalRef | null>>(new Map());
  const terminalInstances = useRef<Map<number, any>>(new Map());
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminals, setTerminals] = useState<number[]>([0]); // Track terminal IDs
  const [nextTerminalId, setNextTerminalId] = useState(1);

  const addTerminal = () => {
    if (terminals.length < MAX_TERMINALS) {
      const newTerminalId = nextTerminalId;
      setTerminals([...terminals, newTerminalId]);
      setNextTerminalId(newTerminalId + 1);
      setActiveTerminal(newTerminalId);
    }
  };

  const removeTerminal = (terminalId: number) => {
    try {
      logger.debug(`Attempting to remove terminal ${terminalId}`);

      if (terminalId === 0) {
        // Cannot remove the main VxC Terminal (ID 0)
        logger.debug("Cannot remove main VxC Terminal (ID 0)");
        return;
      }

      // Log current state
      logger.debug("Current terminals:", terminals);
      logger.debug("Active terminal:", activeTerminal);
      logger.debug(
        "Terminal instances:",
        Array.from(terminalInstances.current.keys())
      );

      // For production stability, add a small delay to ensure terminal is fully initialized
      const performRemoval = () => {
        // Always remove from UI first (force removal for production stability)
        const newTerminals = terminals.filter((id) => id !== terminalId);
        logger.debug("Removing from UI - New terminals array:", newTerminals);
        setTerminals(newTerminals);

        // Adjust active terminal if needed
        if (activeTerminal === terminalId) {
          const newActiveTerminal = newTerminals[0] || 0;
          logger.debug(
            `Switching active terminal from ${terminalId} to ${newActiveTerminal}`
          );
          setActiveTerminal(newActiveTerminal);
        }

        // Then try to clean up backend (this might fail in production but UI will still update)
        try {
          const terminalInstance = terminalInstances.current.get(terminalId);
          if (terminalInstance) {
            logger.debug(
              `Found terminal instance for ID ${terminalId}, removing from store`
            );
            workbenchStore.removeTerminal(terminalInstance);
            logger.debug(
              `Successfully removed terminal ${terminalId} from workbench store`
            );
          } else {
            logger.warn(
              `No terminal instance found for ID ${terminalId}, but UI was removed`
            );
          }
        } catch (error) {
          logger.error(
            `Error removing terminal ${terminalId} from store (but UI was removed):`,
            error
          );
        }

        // Clean up ref maps
        terminalRefs.current.delete(terminalId);
        terminalInstances.current.delete(terminalId);
        logger.debug(`Cleaned up refs for terminal ${terminalId}`);

        logger.debug(`Successfully removed terminal ${terminalId} from UI`);
      };

      // In development, remove immediately; in production, add small delay for stability
      if (import.meta.env.DEV) {
        performRemoval();
      } else {
        // Small delay in production to ensure terminal is fully initialized
        setTimeout(performRemoval, 100);
      }
    } catch (error) {
      logger.error(`Error in removeTerminal for ID ${terminalId}:`, error);
    }
  };

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const isCollapsed = terminal.isCollapsed();

    if (!showTerminal && !isCollapsed) {
      terminal.collapse();
    } else if (showTerminal && isCollapsed) {
      terminal.resize(DEFAULT_TERMINAL_SIZE);
    }

    terminalToggledByShortcut.current = false;
  }, [showTerminal]);

  useEffect(() => {
    const unsubscribeFromEventEmitter = shortcutEventEmitter.on(
      "toggleTerminal",
      () => {
        terminalToggledByShortcut.current = true;
      }
    );

    const unsubscribeFromThemeStore = themeStore.subscribe(() => {
      for (const ref of terminalRefs.current.values()) {
        ref?.reloadStyles();
      }
    });

    return () => {
      unsubscribeFromEventEmitter();
      unsubscribeFromThemeStore();
    };
  }, []);

  return (
    <Panel
      ref={terminalPanelRef}
      defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
      minSize={10}
      collapsible
      onExpand={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(true);
        }
      }}
      onCollapse={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(false);
        }
      }}
    >
      <div className="h-full">
        <div className="bg-white dark:bg-black h-full flex flex-col">
          <div className="flex items-center bg-white dark:bg-[#1a1a1a] border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2">
            {terminals.map((terminalId) => {
              const isActive = activeTerminal === terminalId;

              return (
                <React.Fragment key={terminalId}>
                  {terminalId === 0 ? (
                    <button
                      key={terminalId}
                      className={classNames(
                        "flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full",
                        {
                          "bg-white dark:bg-[#1a1a1a] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary":
                            isActive,
                          "bg-white dark:bg-[#1a1a1a] text-bolt-elements-textSecondary hover:bg-white dark:hover:bg-[#1a1a1a]":
                            !isActive,
                        }
                      )}
                      onClick={() => setActiveTerminal(terminalId)}
                    >
                      <div className="i-ph:terminal-window-duotone text-lg" />
                      VxC Terminal
                    </button>
                  ) : (
                    <React.Fragment>
                      <div className="flex items-center">
                        <button
                          key={terminalId}
                          className={classNames(
                            "flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-l-full",
                            {
                              "bg-white dark:bg-[#1a1a1a] text-bolt-elements-textPrimary":
                                isActive,
                              "bg-white dark:bg-[#1a1a1a] text-bolt-elements-textSecondary hover:bg-white dark:hover:bg-[#1a1a1a]":
                                !isActive,
                            }
                          )}
                          onClick={() => setActiveTerminal(terminalId)}
                        >
                          <div className="i-ph:terminal-window-duotone text-lg" />
                          Terminal {terminalId}
                        </button>
                        <IconButton
                          icon="i-ph:x"
                          size="sm"
                          className={classNames(
                            "px-1 py-2 h-full rounded-r-full border-l border-bolt-elements-borderColor",
                            {
                              "bg-white dark:bg-[#1a1a1a] text-bolt-elements-textPrimary hover:text-red-500":
                                isActive,
                              "bg-white dark:bg-[#1a1a1a] text-bolt-elements-textSecondary hover:text-red-500 hover:bg-white dark:hover:bg-[#1a1a1a]":
                                !isActive,
                            }
                          )}
                          title="Close Terminal"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            logger.debug(
                              `Close button clicked for terminal ${terminalId}`
                            );
                            removeTerminal(terminalId);
                          }}
                        />
                      </div>
                    </React.Fragment>
                  )}
                </React.Fragment>
              );
            })}
            {terminals.length < MAX_TERMINALS && (
              <IconButton icon="i-ph:plus" size="md" onClick={addTerminal} />
            )}
            <IconButton
              className="ml-auto"
              icon="i-ph:caret-down"
              title="Close"
              size="md"
              onClick={() => workbenchStore.toggleTerminal(false)}
            />
          </div>
          {terminals.map((terminalId) => {
            const isActive = activeTerminal === terminalId;

            logger.debug(`Starting bolt terminal [${terminalId}]`);

            if (terminalId === 0) {
              return (
                <Terminal
                  key={terminalId}
                  id={`terminal_${terminalId}`}
                  className={classNames(
                    "h-full overflow-hidden modern-scrollbar-invert",
                    {
                      hidden: !isActive,
                    }
                  )}
                  ref={(ref) => {
                    terminalRefs.current.set(terminalId, ref);
                  }}
                  onTerminalReady={(terminal) => {
                    logger.debug(
                      `Terminal ${terminalId} ready (bolt terminal)`
                    );
                    terminalInstances.current.set(terminalId, terminal);
                    workbenchStore.attachBoltTerminal(terminal);
                  }}
                  onTerminalResize={(cols, rows) =>
                    workbenchStore.onTerminalResize(cols, rows)
                  }
                  theme={theme}
                />
              );
            } else {
              return (
                <Terminal
                  key={terminalId}
                  id={`terminal_${terminalId}`}
                  className={classNames(
                    "modern-scrollbar h-full overflow-hidden",
                    {
                      hidden: !isActive,
                    }
                  )}
                  ref={(ref) => {
                    terminalRefs.current.set(terminalId, ref);
                  }}
                  onTerminalReady={(terminal) => {
                    logger.debug(
                      `Terminal ${terminalId} ready (regular terminal)`
                    );
                    terminalInstances.current.set(terminalId, terminal);
                    workbenchStore.attachTerminal(terminal);
                  }}
                  onTerminalResize={(cols, rows) =>
                    workbenchStore.onTerminalResize(cols, rows)
                  }
                  theme={theme}
                />
              );
            }
          })}
        </div>
      </div>
    </Panel>
  );
});
