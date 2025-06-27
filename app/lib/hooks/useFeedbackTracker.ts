import { useState, useEffect, useCallback } from 'react';
import { supabase, getCurrentUser } from '~/lib/supabase';

export function useFeedbackTracker() {
  const [showBuildingFeedback, setShowBuildingFeedback] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeTracker();
  }, []);

  const initializeTracker = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        setIsInitialized(true);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Get or create user activity record
      let { data: activity, error } = await supabase
        .from('user_activity')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // No record exists, create one
        await supabase
          .from('user_activity')
          .insert({
            user_id: user.id,
            prompt_count: 0,
            last_prompt_date: today,
          });
      }
    } catch (error) {
      console.error('Error initializing feedback tracker:', error);
    } finally {
      setIsInitialized(true);
    }
  };

  const incrementPromptCount = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        console.log('📊 No user found for prompt tracking - trying localStorage fallback');
        // For non-authenticated users, use localStorage
        const today = new Date().toISOString().split('T')[0];
        const storageKey = `feedback_prompts_${today}`;
        const currentCount = parseInt(localStorage.getItem(storageKey) || '0', 10);
        const newCount = currentCount + 1;
        
        localStorage.setItem(storageKey, newCount.toString());
        console.log('📊 localStorage prompt count:', newCount);
        
        if (newCount === 3) {
          const lastShownKey = `feedback_shown_${today}`;
          if (!localStorage.getItem(lastShownKey)) {
            console.log('🎉 Triggering feedback modal for anonymous user! Count reached 3');
            localStorage.setItem(lastShownKey, 'true');
            setShowBuildingFeedback(true);
          }
        }
        return;
      }

      console.log('📊 Incrementing prompt count for user:', user.id);
      const today = new Date().toISOString().split('T')[0];

      // Get current activity
      const { data: activity, error } = await supabase
        .from('user_activity')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Create new record
        console.log('📊 Creating new user activity record');
        await supabase
          .from('user_activity')
          .insert({
            user_id: user.id,
            prompt_count: 1,
            last_prompt_date: today,
          });
        console.log('📊 New activity record created, prompt count: 1');
      } else if (!error && activity) {
        // Update existing record
        const isNewDay = activity.last_prompt_date !== today;
        const newCount = isNewDay ? 1 : activity.prompt_count + 1;

        console.log('📊 Updating prompt count:', {
          currentCount: activity.prompt_count,
          newCount,
          isNewDay,
          today,
          lastPromptDate: activity.last_prompt_date,
          lastFeedbackShown: activity.last_feedback_shown
        });

        await supabase
          .from('user_activity')
          .update({
            prompt_count: newCount,
            last_prompt_date: today,
          })
          .eq('user_id', user.id);

        // Check if we should show feedback after this update
        if (newCount === 3 && (!activity.last_feedback_shown || activity.last_feedback_shown !== today)) {
          console.log('🎉 Triggering feedback modal! Count reached 3');
          setShowBuildingFeedback(true);
          
          // Update the last feedback shown date
          await supabase
            .from('user_activity')
            .update({ 
              last_feedback_shown: today,
              feedback_shown_count: (activity.feedback_shown_count || 0) + 1 
            })
            .eq('user_id', user.id);
        } else {
          console.log('📊 Not showing feedback:', { 
            newCount, 
            lastFeedbackShown: activity.last_feedback_shown, 
            today 
          });
        }
      } else {
        console.error('📊 Error fetching user activity:', error);
      }
    } catch (error) {
      console.error('Error incrementing prompt count:', error);
    }
  }, []);

  const closeBuildingFeedback = useCallback(() => {
    setShowBuildingFeedback(false);
  }, []);

  return {
    showBuildingFeedback,
    closeBuildingFeedback,
    incrementPromptCount,
    isInitialized,
  };
} 