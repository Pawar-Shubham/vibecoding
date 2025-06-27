import { useState } from 'react';
import { RiFeedbackLine } from 'react-icons/ri';
import { FeedbackModal } from './FeedbackModal';

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors bg-transparent border-none outline-none focus:outline-none"
        title="Give us feedback"
      >
        <RiFeedbackLine className="w-6 h-6" />
      </button>
      
      <FeedbackModal 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        type="improvement"
      />
    </>
  );
} 