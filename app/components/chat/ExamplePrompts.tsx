import React from 'react';

const EXAMPLE_PROMPTS = [
  { text: 'Create a Cookie Consent form using Material UI' },
  { text: 'Make a Space Invaders Game' },
  { text: 'Make a Tic Tac Toe game in HTML, CSS and JS' },
  { text: 'Build a To-Do App in React using Tailwind' },
  { text: 'Build a Simple Blog using Astro' },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative flex flex-col gap-4 lg:gap-9 w-full max-w-3xl mx-auto flex justify-center mt-3 lg:mt-6">
      <div
        className="flex flex-wrap justify-center gap-1.5 lg:gap-2 px-2"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.text);
              }}
              className="rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-3 lg:px-4 py-1 lg:py-1.5 text-[10px] lg:text-xs transition-theme border border-[#e5e7eb] dark:border-transparent whitespace-nowrap"
            >
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
