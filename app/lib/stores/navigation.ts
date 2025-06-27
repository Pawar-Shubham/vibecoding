import { atom } from 'nanostores';

// Store to track navigation loading state
export const navigationLoading = atom<boolean>(false);

// Helper function to show loading for navigation
export function setNavigationLoading(loading: boolean) {
  navigationLoading.set(loading);
}

// Helper function to start navigation loading immediately
export function startNavigationLoading() {
  setNavigationLoading(true);
}

// Helper function to stop navigation loading
export function stopNavigationLoading() {
  setNavigationLoading(false);
} 