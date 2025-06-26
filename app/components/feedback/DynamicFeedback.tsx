import React from 'react';
import { FeedbackModal } from './FeedbackModal';
import { useFeedbackTracker } from '~/lib/hooks/useFeedbackTracker';

interface DynamicFeedbackProps {
  onPromptCountIncrement?: () => void;
}

export function DynamicFeedback({ onPromptCountIncrement }: DynamicFeedbackProps) {
  const { 
    showBuildingFeedback, 
    closeBuildingFeedback, 
    incrementPromptCount,
    isInitialized 
  } = useFeedbackTracker();

  // Expose incrementPromptCount to global context
  React.useEffect(() => {
    if (isInitialized) {
      // Make the function available globally so chat can call it
      (window as any).incrementFeedbackPromptCount = incrementPromptCount;
      console.log('🔧 Feedback tracker initialized, global function exposed');
    }
  }, [incrementPromptCount, isInitialized]);

  if (!isInitialized) {
    return null;
  }

  return (
    <FeedbackModal
      isOpen={showBuildingFeedback}
      onClose={closeBuildingFeedback}
      type="building"
    />
  );
} 