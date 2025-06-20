import { atom } from 'nanostores';
import type { NetlifyConnection, NetlifyUser } from '~/types/netlify';
import { logStore } from './logs';
import { toast } from 'react-toastify';

// Initialize with stored connection only - no environment variable fallback
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('netlify_connection') : null;

// Initialize with empty state or stored connection - never use environment tokens globally
const initialConnection: NetlifyConnection = storedConnection
  ? JSON.parse(storedConnection)
  : {
      user: null,
      token: '',
      stats: undefined,
    };

export const netlifyConnection = atom<NetlifyConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

export const updateNetlifyConnection = (updates: Partial<NetlifyConnection>) => {
  const currentState = netlifyConnection.get();
  const newState = { ...currentState, ...updates };
  netlifyConnection.set(newState);

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('netlify_connection', JSON.stringify(newState));
  }
};

// Reset function to clear connection state (useful for user logout/switch)
export const resetNetlifyConnection = () => {
  const emptyState: NetlifyConnection = {
    user: null,
    token: '',
    stats: undefined,
  };
  
  netlifyConnection.set(emptyState);
  
  // Clear localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('netlify_connection');
  }
};

export async function fetchNetlifyStats(token: string) {
  try {
    isFetchingStats.set(true);

    const sitesResponse = await fetch('https://api.netlify.com/api/v1/sites', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!sitesResponse.ok) {
      throw new Error(`Failed to fetch sites: ${sitesResponse.status}`);
    }

    const sites = (await sitesResponse.json()) as any;

    const currentState = netlifyConnection.get();
    updateNetlifyConnection({
      ...currentState,
      stats: {
        sites,
        totalSites: sites.length,
      },
    });
  } catch (error) {
    console.error('Netlify API Error:', error);
    logStore.logError('Failed to fetch Netlify stats', { error });
    toast.error('Failed to fetch Netlify statistics');
  } finally {
    isFetchingStats.set(false);
  }
}
