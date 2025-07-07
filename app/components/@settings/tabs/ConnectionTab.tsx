import { useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';

export function ConnectionTab() {
  const [netlifyToken, setNetlifyToken] = useState('');
  const [vercelToken, setVercelToken] = useState('');

  return (
    <div className="space-y-6">
      {/* Netlify Connection */}
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="i-simple-icons:netlify text-[#00AD9F] w-5 h-5" />
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">Netlify Connection</h3>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-bolt-elements-textSecondary mb-2">
              API Token
            </label>
            <Input
              type="password"
              value={netlifyToken}
              onChange={(e) => setNetlifyToken(e.target.value)}
              placeholder="Enter your Netlify API token"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[#F8F8F8] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333] text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive disabled:opacity-50"
            />
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              <a
                href="https://app.netlify.com/user/applications/personal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
              >
                Get your token
                <span className="i-ph:arrow-square-out w-4 h-4" />
              </a>
            </div>
          </div>
          <Button
            variant="secondary"
            disabled
            className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-[#303030] text-white hover:bg-[#5E41D0] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform active:scale-95"
          >
            <span className="i-ph:plug-charging w-4 h-4" />
            Connect
          </Button>
        </div>
      </div>

      {/* Vercel Connection */}
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="i-simple-icons:vercel text-white w-5 h-5" />
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">Vercel Connection</h3>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-bolt-elements-textSecondary mb-2">
              Personal Access Token
            </label>
            <Input
              type="password"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="Enter your Vercel personal access token"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[#F8F8F8] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333] text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive disabled:opacity-50"
            />
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
              >
                Get your token
                <span className="i-ph:arrow-square-out w-4 h-4" />
              </a>
            </div>
          </div>
          <Button
            variant="secondary"
            disabled
            className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-[#303030] text-white hover:bg-[#5E41D0] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform active:scale-95"
          >
            <span className="i-ph:plug-charging w-4 h-4" />
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
} 