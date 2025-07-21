import React, { useContext } from 'react';
import type { GitHubRepoInfo } from '~/types/GitHub';
import { EmptyState, StatusIndicator } from '~/components/ui';
import { RepositoryCard } from './RepositoryCard';
import { RepositoryDialogContext } from './RepositoryDialogContext';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';

interface RepositoryListProps {
  repos: GitHubRepoInfo[];
  isLoading: boolean;
  onSelect: (repo: GitHubRepoInfo) => void;
  activeTab: string;
}

export function RepositoryList({ repos, isLoading, onSelect, activeTab }: RepositoryListProps) {
  // Access the parent component's setShowAuthDialog function
  const { setShowAuthDialog } = useContext(RepositoryDialogContext);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <StatusIndicator status="loading">Loading repositories...</StatusIndicator>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={activeTab === 'search' ? 'i-ph:magnifying-glass' : 'i-ph:git-repository'}
        title="No repositories found"
        description={
          activeTab === 'my-repos'
            ? 'Connect your GitHub account or create a new repository to get started'
            : 'Try adjusting your search query or filters'
        }
        actionLabel={activeTab === 'my-repos' ? 'Connect GitHub Account' : undefined}
        onAction={activeTab === 'my-repos' ? () => setShowAuthDialog(true) : undefined}
      />
    );
  }

  return (
    <div className="space-y-2 flex flex-col items-center">
      {repos.map((repo) => (
        <motion.button
          key={repo.full_name}
          type="button"
          onClick={() => onSelect(repo)}
          className={classNames(
            'text-left rounded-lg',
            'py-5 px-4', // taller card
            'max-w-[95%] w-[95%]', // make width fit better
            'mx-auto',
            'bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3',
            'hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4',
            'transition-colors group',
            'border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark',
            'hover:border-[#07F29C]/30',
            'focus:outline-none',
            'focus:ring-2 focus:ring-[#07F29C]/30',
            'relative',
            'overflow-hidden'
          )}
          whileHover={{ scale: 1.01, x: 0 }}
          whileTap={{ scale: 0.99, x: 0 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="i-ph:git-branch w-4 h-4 text-[#07F29C]" />
              <span className={classNames(
                'text-sm font-medium',
                'text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark',
                'group-hover:text-[#07F29C]'
              )}>
                {repo.name}
              </span>
            </div>
            {repo.private && (
              <span className={classNames(
                'px-2 py-0.5 text-xs rounded-full',
                'bg-[#07F29C]/10 text-[#07F29C]',
                'font-medium flex items-center gap-1'
              )}>
                <span className="i-ph:lock w-3 h-3" />
                Private
              </span>
            )}
          </div>
          {repo.description && (
            <p className="mt-1 text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark line-clamp-2">
              {repo.description}
            </p>
          )}
        </motion.button>
      ))}
    </div>
  );
}
