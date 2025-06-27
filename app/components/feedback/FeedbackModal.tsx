import { useState } from 'react';
import { FaStar, FaTimes } from 'react-icons/fa';
import { supabase, getCurrentUser } from '~/lib/supabase';
import * as Dialog from '@radix-ui/react-dialog';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'improvement' | 'building';
}

export function FeedbackModal({ isOpen, onClose, type }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating && type === 'improvement') return; // Rating required for improvement feedback
    
    setIsSubmitting(true);
    
    try {
      const user = await getCurrentUser();
      
      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: user?.id || null,
          feedback_type: type,
          rating: type === 'improvement' ? rating : null,
          message: message.trim() || null,
        });

      if (error) {
        console.error('Error submitting feedback:', error);
      } else {
        setSubmitted(true);
        setTimeout(() => {
          onClose();
          setSubmitted(false);
          setRating(0);
          setMessage('');
        }, 2000);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    setRating(0);
    setMessage('');
    setSubmitted(false);
  };

  const title = type === 'improvement' 
    ? 'Tell us how we can improve?' 
    : 'What are you building today?';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="auth-modal-overlay fixed inset-0 z-50" />
        <Dialog.Content className="auth-modal-content fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-8 w-full max-w-md">
          <div className="mb-6 text-center">
            <Dialog.Title className="text-xl font-bold text-white dark:text-white light-mode-title mb-2">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-gray-800 dark:text-gray-300 text-sm">
              {type === 'improvement' 
                ? 'Help us make your experience better' 
                : 'Share what you\'re working on with us!'}
            </Dialog.Description>
          </div>

          {submitted ? (
            <div className="text-center py-8">
              <div className="text-green-500 text-4xl mb-3">✅</div>
              <p className="text-gray-800 dark:text-gray-300">
                Thank you for your feedback!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {type === 'improvement' && (
                <div className="text-center">
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-3">
                    Rate your experience
                  </label>
                  <div className="flex gap-2 justify-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="text-2xl focus:outline-none bg-transparent border-none p-1 hover:scale-110 transition-transform"
                      >
                        <FaStar
                          className={
                            star <= (hoveredRating || rating)
                              ? 'text-yellow-400'
                              : 'text-gray-300 dark:text-gray-600'
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-2">
                  {type === 'improvement' ? 'Your feedback' : 'Tell us about your project'}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="auth-input w-full px-4 py-3 rounded-lg resize-none"
                  placeholder={
                    type === 'improvement'
                      ? 'How can we improve your experience?'
                      : 'What are you working on? Any cool projects?'
                  }
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="auth-btn-secondary flex-1 py-3 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (type === 'improvement' && !rating)}
                  className="auth-btn-primary flex-1 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          )}

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-transparent border-none outline-none focus:outline-none"
              aria-label="Close"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
} 