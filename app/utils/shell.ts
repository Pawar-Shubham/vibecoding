import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import type { ITerminal } from '~/types/terminal';
import { withResolvers } from './promises';
import { atom } from 'nanostores';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';

// Add supported proxy commands
const PROXY_COMMANDS = new Set(['curl', 'fetch']);

// Add type for proxy response
interface ProxyResponse {
  error?: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: string;
}

// Helper to parse command string into command and args
function parseCommand(commandStr: string): { command: string; args: string[] } {
  const parts = commandStr.trim().split(/\s+/);
  const result = {
    command: parts[0],
    args: parts.slice(1)
  };
  console.log('[Shell] Parsed command:', result);
  return result;
}

// Helper to format proxy response for terminal
function formatProxyResponse(response: ProxyResponse): string {
  if (response.error) {
    return `Error: ${response.error}\n`;
  }

  let output = '';
  if (response.status) {
    output += `HTTP/${response.status} ${response.statusText}\n`;
  }
  
  if (response.headers) {
    for (const [key, value] of Object.entries(response.headers)) {
      output += `${key}: ${value}\n`;
    }
    output += '\n';
  }
  
  if (response.data) {
    output += response.data;
  }
  
  return output;
}

export async function newShellProcess(webcontainer: WebContainer, terminal: ITerminal) {
  const args: string[] = [];

  // we spawn a JSH process with a fallback cols and rows in case the process is not attached yet to a visible terminal
  const process = await webcontainer.spawn('/bin/jsh', ['--osc', ...args], {
    terminal: {
      cols: terminal.cols ?? 80,
      rows: terminal.rows ?? 15,
    },
  });

  const input = process.input.getWriter();
  const output = process.output;

  const jshReady = withResolvers<void>();

  let isInteractive = false;
  output.pipeTo(
    new WritableStream({
      write(data) {
        if (!isInteractive) {
          const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

          if (osc === 'interactive') {
            // wait until we see the interactive OSC
            isInteractive = true;

            jshReady.resolve();
          }
        }

        terminal.write(data);
      },
    }),
  );

  terminal.onData((data) => {
    // console.log('terminal onData', { data, isInteractive });

    if (isInteractive) {
      input.write(data);
    }
  });

  await jshReady.promise;

  return process;
}

export type ExecutionResult = { output: string; exitCode: number } | undefined;

export class BoltShell {
  #initialized: (() => void) | undefined;
  #readyPromise: Promise<void>;
  #webcontainer: WebContainer | undefined;
  #terminal: ITerminal | undefined;
  #process: WebContainerProcess | undefined;
  executionState = atom<
    { sessionId: string; active: boolean; executionPrms?: Promise<any>; abort?: () => void } | undefined
  >();
  #outputStream: ReadableStreamDefaultReader<string> | undefined;
  #shellInputStream: WritableStreamDefaultWriter<string> | undefined;
  #currentLine = '';
  #isProxyCommand = false;

  constructor() {
    this.#readyPromise = new Promise((resolve) => {
      this.#initialized = resolve;
    });
  }

  ready() {
    return this.#readyPromise;
  }

  async init(webcontainer: WebContainer, terminal: ITerminal) {
    this.#webcontainer = webcontainer;
    this.#terminal = terminal;

    // Use all three streams from tee: one for terminal, one for command execution, one for Expo URL detection
    const { process, commandStream, expoUrlStream } = await this.newBoltShellProcess(webcontainer, terminal);
    this.#process = process;
    this.#outputStream = commandStream.getReader();

    // Start background Expo URL watcher immediately
    this._watchExpoUrlInBackground(expoUrlStream);

    await this.waitTillOscCode('interactive');
    
    // Display welcome message
    this._displayWelcomeMessage();
    
    this.#initialized?.();
  }

  async newBoltShellProcess(webcontainer: WebContainer, terminal: ITerminal) {
    const args: string[] = [];
    const process = await webcontainer.spawn('/bin/jsh', ['--osc', ...args], {
      terminal: {
        cols: terminal.cols ?? 80,
        rows: terminal.rows ?? 15,
      },
    });

    const input = process.input.getWriter();
    this.#shellInputStream = input;

    // Tee the output so we can have three independent readers
    const [streamA, streamB] = process.output.tee();
    const [streamC, streamD] = streamB.tee();

    const jshReady = withResolvers<void>();
    let isInteractive = false;
    streamA.pipeTo(
      new WritableStream({
        write(data) {
          if (!isInteractive) {
            const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

            if (osc === 'interactive') {
              isInteractive = true;
              jshReady.resolve();
            }
          }

          terminal.write(data);
        },
      }),
    );

    // Handle terminal input
    terminal.onData((data) => {
      if (isInteractive) {
        // Special handling for command history (up/down arrow) and pasted content
        const charCode = data.charCodeAt(0);
        
        // Handle up/down arrow keys (27 91 65 for up, 27 91 66 for down)
        if (data === '\x1b[A' || data === '\x1b[B') {
          input.write(data);
          return;
        }
        
        // Handle enter key
        if (charCode === 13 || charCode === 10) { // Enter key
          const line = this.#currentLine.trim();
          
          if (line) {
            const { command: cmd, args } = parseCommand(line);
            if (PROXY_COMMANDS.has(cmd)) {
              // Clear the line from terminal buffer
              const clearLine = '\b'.repeat(this.#currentLine.length) + ' '.repeat(this.#currentLine.length) + '\b'.repeat(this.#currentLine.length);
              input.write(clearLine);
              
              // Handle proxy command
              this.handleProxyCommand(cmd, args).catch(error => {
                terminal.write(`\r\nError: ${error}\r\n$ `);
              });
              
              // Reset state
              this.#currentLine = '';
              this.#isProxyCommand = false;
              return;
            }
          }
          
          // Not a proxy command, pass to terminal
          this.#currentLine = '';
          this.#isProxyCommand = false;
          input.write(data);
        } else if (charCode === 3) { // Ctrl+C
          this.#currentLine = '';
          this.#isProxyCommand = false;
          input.write(data);
        } else if (charCode === 127 || charCode === 8) { // Backspace
          if (this.#currentLine.length > 0) {
            this.#currentLine = this.#currentLine.slice(0, -1);
            input.write(data);
          }
        } else {
          // Handle pasted content (multiple characters at once)
          this.#currentLine += data;
          input.write(data);
        }

        // Update proxy command status after any input
        if (this.#currentLine) {
          const { command: cmd } = parseCommand(this.#currentLine);
          this.#isProxyCommand = PROXY_COMMANDS.has(cmd);
        }
      }
    });

    await jshReady.promise;

    // Return all streams for use in init
    return { process, terminalStream: streamA, commandStream: streamC, expoUrlStream: streamD };
  }

  // Handle proxy commands directly
  private async handleProxyCommand(cmd: string, args: string[]): Promise<void> {
    if (!this.terminal) return;

    try {
      const proxyCommand = { command: cmd, args };
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const proxyUrl = `${baseUrl}/api/proxy?command=${encodeURIComponent(JSON.stringify(proxyCommand))}`;
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json() as ProxyResponse;
      
      // Write response to terminal
      this.terminal.write('\r\n' + (result.data || '') + '\r\n$ ');
    } catch (error) {
      throw new Error(`Failed to execute proxy command: ${error}`);
    }
  }

  // Dedicated background watcher for Expo URL
  private async _watchExpoUrlInBackground(stream: ReadableStream<string>) {
    const reader = stream.getReader();
    let buffer = '';
    const expoUrlRegex = /(exp:\/\/[^\s]+)/;

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += value || '';

      const expoUrlMatch = buffer.match(expoUrlRegex);

      if (expoUrlMatch) {
        const cleanUrl = expoUrlMatch[1]
          .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
          .replace(/[^\x20-\x7E]+$/g, '');
        expoUrlAtom.set(cleanUrl);
        buffer = buffer.slice(buffer.indexOf(expoUrlMatch[1]) + expoUrlMatch[1].length);
      }

      if (buffer.length > 2048) {
        buffer = buffer.slice(-2048);
      }
    }
  }

  get terminal() {
    return this.#terminal;
  }

  get process() {
    return this.#process;
  }

  private _displayWelcomeMessage() {
    if (!this.#terminal) return;

    const welcomeMessage = `
\x1b[1;36m╔══════════════════════════════════════════════════════════════╗\x1b[0m
\x1b[1;36m║                         VxC Terminal!                        ║\x1b[0m
\x1b[1;36m╚══════════════════════════════════════════════════════════════╝\x1b[0m

\x1b[1;33m🎉  Hello there! Welcome to the VxC Development Environment.\x1b[0m

\x1b[1;32m📋  Quick Start Commands:\x1b[0m
  • \x1b[1;34mnpm install\x1b[0m     - Install project dependencies
  • \x1b[1;34mnpm run dev\x1b[0m     - Start development server
  • \x1b[1;34mnpm run build\x1b[0m   - Build for production (Deployment Requirement)

\x1b[1;32m🔧  Useful Commands:\x1b[0m
  • \x1b[1;34mls\x1b[0m              - List files and directories
  • \x1b[1;34mcd <directory>\x1b[0m  - Change directory
  • \x1b[1;34mcat <file>\x1b[0m      - View file contents
  • \x1b[1;34mnano <file>\x1b[0m     - Edit file in terminal
  • \x1b[1;34mclear\x1b[0m           - Clear terminal screen

\x1b[1;32m💡  Tips:\x1b[0m
  • Use \x1b[1;34mCtrl+C\x1b[0m to cancel running commands
  • Use \x1b[1;34mCtrl+L\x1b[0m to clear screen

\x1b[1;35m Ready to Create! 🚀\x1b[0m

`;
    
    this.#terminal.write(welcomeMessage);
  }

  async executeCommand(sessionId: string, command: string, abort?: () => void): Promise<ExecutionResult> {
    if (!this.process || !this.terminal) {
      return undefined;
    }

    const state = this.executionState.get();

    if (state?.active && state.abort) {
      state.abort();
    }

    // Parse the command
    const { command: cmd, args } = parseCommand(command);

    // Check if this is a proxy command
    if (PROXY_COMMANDS.has(cmd)) {
      try {
        const proxyCommand = {
          command: cmd,
          args
        };
        
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const proxyUrl = `${baseUrl}/api/proxy?command=${encodeURIComponent(JSON.stringify(proxyCommand))}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json() as ProxyResponse;
        return {
          output: result.data || '',
          exitCode: result.error ? 1 : 0
        };
      } catch (error) {
        return {
          output: `Error executing proxy command: ${error}\n`,
          exitCode: 1
        };
      }
    }

    // Handle non-proxy commands as before
    this.terminal.input('\x03');
    await this.waitTillOscCode('prompt');

    if (state && state.executionPrms) {
      await state.executionPrms;
    }

    //start a new execution
    this.terminal.input(command.trim() + '\n');

    //wait for the execution to finish
    const executionPromise = this.getCurrentExecutionResult();
    this.executionState.set({ sessionId, active: true, executionPrms: executionPromise, abort });

    const resp = await executionPromise;
    this.executionState.set({ sessionId, active: false });

    if (resp) {
      try {
        resp.output = cleanTerminalOutput(resp.output);
      } catch (error) {
        console.log('failed to format terminal output', error);
      }
    }

    return resp;
  }

  async getCurrentExecutionResult(): Promise<ExecutionResult> {
    const { output, exitCode } = await this.waitTillOscCode('exit');
    return { output, exitCode };
  }

  onQRCodeDetected?: (qrCode: string) => void;

  async waitTillOscCode(waitCode: string) {
    let fullOutput = '';
    let exitCode: number = 0;
    let buffer = ''; // <-- Add a buffer to accumulate output

    if (!this.#outputStream) {
      return { output: fullOutput, exitCode };
    }

    const tappedStream = this.#outputStream;

    // Regex for Expo URL
    const expoUrlRegex = /(exp:\/\/[^\s]+)/;

    while (true) {
      const { value, done } = await tappedStream.read();

      if (done) {
        break;
      }

      const text = value || '';
      fullOutput += text;
      buffer += text; // <-- Accumulate in buffer

      // Extract Expo URL from buffer and set store
      const expoUrlMatch = buffer.match(expoUrlRegex);

      if (expoUrlMatch) {
        // Remove any trailing ANSI escape codes or non-printable characters
        const cleanUrl = expoUrlMatch[1]
          .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
          .replace(/[^\x20-\x7E]+$/g, '');
        expoUrlAtom.set(cleanUrl);

        // Remove everything up to and including the URL from the buffer to avoid duplicate matches
        buffer = buffer.slice(buffer.indexOf(expoUrlMatch[1]) + expoUrlMatch[1].length);
      }

      // Check if command completion signal with exit code
      const [, osc, , , code] = text.match(/\x1b\]654;([^\x07=]+)=?((-?\d+):(\d+))?\x07/) || [];

      if (osc === 'exit') {
        exitCode = parseInt(code, 10);
      }

      if (osc === waitCode) {
        break;
      }
    }

    return { output: fullOutput, exitCode };
  }
}

/**
 * Cleans and formats terminal output while preserving structure and paths
 * Handles ANSI, OSC, and various terminal control sequences
 */
export function cleanTerminalOutput(input: string): string {
  // Step 1: Remove OSC sequences (including those with parameters)
  const removeOsc = input
    .replace(/\x1b\](\d+;[^\x07\x1b]*|\d+[^\x07\x1b]*)\x07/g, '')
    .replace(/\](\d+;[^\n]*|\d+[^\n]*)/g, '');

  // Step 2: Remove ANSI escape sequences and color codes more thoroughly
  const removeAnsi = removeOsc
    // Remove all escape sequences with parameters
    .replace(/\u001b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    // Remove color codes
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Clean up any remaining escape characters
    .replace(/\u001b/g, '')
    .replace(/\x1b/g, '');

  // Step 3: Clean up carriage returns and newlines
  const cleanNewlines = removeAnsi
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // Step 4: Add newlines at key breakpoints while preserving paths
  const formatOutput = cleanNewlines
    // Preserve prompt line
    .replace(/^([~\/][^\n❯]+)❯/m, '$1\n❯')
    // Add newline before command output indicators
    .replace(/(?<!^|\n)>/g, '\n>')
    // Add newline before error keywords without breaking paths
    .replace(/(?<!^|\n|\w)(error|failed|warning|Error|Failed|Warning):/g, '\n$1:')
    // Add newline before 'at' in stack traces without breaking paths
    .replace(/(?<!^|\n|\/)(at\s+(?!async|sync))/g, '\nat ')
    // Ensure 'at async' stays on same line
    .replace(/\bat\s+async/g, 'at async')
    // Add newline before npm error indicators
    .replace(/(?<!^|\n)(npm ERR!)/g, '\n$1');

  // Step 5: Clean up whitespace while preserving intentional spacing
  const cleanSpaces = formatOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // Step 6: Final cleanup
  return cleanSpaces
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
    .replace(/:\s+/g, ': ') // Normalize spacing after colons
    .replace(/\s{2,}/g, ' ') // Remove multiple spaces
    .replace(/^\s+|\s+$/g, '') // Trim start and end
    .replace(/\u0000/g, ''); // Remove null characters
}

export function newBoltShellProcess() {
  return new BoltShell();
}
