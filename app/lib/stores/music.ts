import { atom } from 'nanostores';

export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  url: string;
  youtubeId?: string;
  publishedAt?: string;
  description?: string;
}

export interface MusicState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  playlist: Track[];
  isVisible: boolean;
  isExpanded: boolean;
  searchResults: Track[];
  isSearching: boolean;
  searchQuery: string;
  apiError: string | null;
  pendingTrack: Track | null;
}

// Persistence utilities
const STORAGE_KEY = 'vxc-music-state';

interface PersistedMusicState {
  currentTrack: Track | null;
  volume: number;
  playlist: Track[];
  isExpanded: boolean;
  currentTime: number;
}

const saveToStorage = (state: PersistedMusicState) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (error) {
    console.warn('Failed to save music state to localStorage:', error);
  }
};

const loadFromStorage = (): Partial<PersistedMusicState> => {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    }
  } catch (error) {
    console.warn('Failed to load music state from localStorage:', error);
  }
  return {};
};

// Load persisted state
const persistedState = loadFromStorage();

const initialState: MusicState = {
  currentTrack: persistedState.currentTrack || null,
  isPlaying: false, // Never auto-play on load
  isLoading: false,
  volume: persistedState.volume ?? 0.7,
  currentTime: persistedState.currentTime ?? 0, // Restore timestamp
  duration: 0,
  playlist: persistedState.playlist || [],
  isVisible: true,
  isExpanded: persistedState.isExpanded ?? false,
  searchResults: [],
  isSearching: false,
  searchQuery: '',
  apiError: null,
  pendingTrack: null,
};

export const musicStore = atom<MusicState>(initialState);

// Throttled timestamp saving to avoid excessive localStorage writes
let lastTimestampSave = 0;
const TIMESTAMP_SAVE_INTERVAL = 5000; // Save every 5 seconds

const saveTimestampThrottled = (state: MusicState) => {
  const now = Date.now();
  if (now - lastTimestampSave >= TIMESTAMP_SAVE_INTERVAL) {
    lastTimestampSave = now;
    saveToStorage({
      currentTrack: state.currentTrack,
      volume: state.volume,
      playlist: state.playlist,
      isExpanded: state.isExpanded,
      currentTime: state.currentTime,
    });
  }
};

// Save timestamp on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const state = musicStore.get();
    if (state.currentTrack) {
      saveToStorage({
        currentTrack: state.currentTrack,
        volume: state.volume,
        playlist: state.playlist,
        isExpanded: state.isExpanded,
        currentTime: state.currentTime,
      });
    }
  });
}

// Singleton audio manager to prevent multiple audio elements
class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private registeredComponents = new Set<string>();
  private activeComponentId: string | null = null;

  registerComponent(componentId: string): HTMLAudioElement {
    this.registeredComponents.add(componentId);
    
    // Create audio element if it doesn't exist
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'metadata';
      this.audio.crossOrigin = 'anonymous';
      
      // Set up global event handlers
      this.audio.addEventListener('timeupdate', () => {
        if (!this.isSeeking) {
          musicActions.setCurrentTime(this.audio!.currentTime);
        }
      });
      
      this.audio.addEventListener('loadedmetadata', () => {
        musicActions.setDuration(this.audio!.duration);
      });
      
      this.audio.addEventListener('ended', () => {
        musicActions.playNext();
      });
      
      this.audio.addEventListener('loadstart', () => {
        musicActions.setLoading(true);
      });
      
      this.audio.addEventListener('canplay', () => {
        musicActions.setLoading(false);
      });

      this.audio.addEventListener('error', (e) => {
        console.error('Global audio error:', e);
        musicActions.setLoading(false);
      });
    }
    
    // Set this component as active if none is active
    if (!this.activeComponentId) {
      this.activeComponentId = componentId;
    }
    
    return this.audio;
  }

  unregisterComponent(componentId: string) {
    this.registeredComponents.delete(componentId);
    
    // If this was the active component, transfer control to another
    if (this.activeComponentId === componentId) {
      const remaining = Array.from(this.registeredComponents);
      this.activeComponentId = remaining[0] || null;
    }
    
    // Clean up audio if no components left
    if (this.registeredComponents.size === 0 && this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
      this.activeComponentId = null;
    }
  }

  isActiveComponent(componentId: string): boolean {
    return this.activeComponentId === componentId;
  }

  setActiveComponent(componentId: string) {
    if (this.registeredComponents.has(componentId)) {
      this.activeComponentId = componentId;
    }
  }

  getAudio(): HTMLAudioElement | null {
    return this.audio;
  }

  private isSeeking = false;

  setSeeking(seeking: boolean) {
    this.isSeeking = seeking;
  }

  seek(time: number) {
    if (this.audio) {
      this.isSeeking = true;
      this.audio.currentTime = time;
      musicActions.setCurrentTime(time);
      
      // Clear seeking state after a delay
      setTimeout(() => {
        this.isSeeking = false;
      }, 300);
    }
  }
}

// Global singleton instance
export const audioManager = new AudioManager();

// Action creators
export const musicActions = {
  setCurrentTrack: (track: Track | null) => {
    const newState = {
      ...musicStore.get(),
      currentTrack: track,
    };
    musicStore.set(newState);
    
    // Persist important state
    saveToStorage({
      currentTrack: track,
      volume: newState.volume,
      playlist: newState.playlist,
      isExpanded: newState.isExpanded,
      currentTime: newState.currentTime,
    });
  },

  setPlaying: (isPlaying: boolean) => {
    musicStore.set({
      ...musicStore.get(),
      isPlaying,
    });
  },

  setLoading: (isLoading: boolean) => {
    musicStore.set({
      ...musicStore.get(),
      isLoading,
    });
  },

  setVolume: (volume: number) => {
    const newVolume = Math.max(0, Math.min(1, volume));
    const newState = {
      ...musicStore.get(),
      volume: newVolume,
    };
    musicStore.set(newState);
    
    // Update audio element volume immediately
    const audio = audioManager.getAudio();
    if (audio) {
      audio.volume = newVolume;
    }
    
    // Persist volume change
    saveToStorage({
      currentTrack: newState.currentTrack,
      volume: newVolume,
      playlist: newState.playlist,
      isExpanded: newState.isExpanded,
      currentTime: newState.currentTime,
    });
  },

  setCurrentTime: (currentTime: number) => {
    const newState = {
      ...musicStore.get(),
      currentTime,
    };
    musicStore.set(newState);
    
    // Throttled save for regular playback updates
    if (newState.currentTrack) {
      saveTimestampThrottled(newState);
    }
  },

  setDuration: (duration: number) => {
    musicStore.set({
      ...musicStore.get(),
      duration,
    });
  },

  setExpanded: (isExpanded: boolean) => {
    const newState = {
      ...musicStore.get(),
      isExpanded,
    };
    musicStore.set(newState);
    
    // Persist expanded state
    saveToStorage({
      currentTrack: newState.currentTrack,
      volume: newState.volume,
      playlist: newState.playlist,
      isExpanded,
      currentTime: newState.currentTime,
    });
  },

  addToPlaylist: (track: Track) => {
    const current = musicStore.get();
    const exists = current.playlist.some(t => t.id === track.id);
    if (!exists) {
      const newPlaylist = [...current.playlist, track];
      const newState = {
        ...current,
        playlist: newPlaylist,
      };
      musicStore.set(newState);
      
      // Persist playlist change
      saveToStorage({
        currentTrack: newState.currentTrack,
        volume: newState.volume,
        playlist: newPlaylist,
        isExpanded: newState.isExpanded,
        currentTime: newState.currentTime,
      });
    }
  },

  removeFromPlaylist: (trackId: string) => {
    const current = musicStore.get();
    const newPlaylist = current.playlist.filter(t => t.id !== trackId);
    const newState = {
      ...current,
      playlist: newPlaylist,
    };
    musicStore.set(newState);
    
    // Persist playlist change
    saveToStorage({
      currentTrack: newState.currentTrack,
      volume: newState.volume,
      playlist: newPlaylist,
      isExpanded: newState.isExpanded,
      currentTime: newState.currentTime,
    });
  },

  setVisible: (isVisible: boolean) => {
    musicStore.set({
      ...musicStore.get(),
      isVisible,
    });
  },

  setSearchResults: (results: Track[]) => {
    musicStore.set({
      ...musicStore.get(),
      searchResults: results,
    });
  },

  setSearching: (isSearching: boolean) => {
    musicStore.set({
      ...musicStore.get(),
      isSearching,
    });
  },

  setSearchQuery: (query: string) => {
    musicStore.set({
      ...musicStore.get(),
      searchQuery: query,
    });
  },

  setApiError: (error: string | null) => {
    musicStore.set({
      ...musicStore.get(),
      apiError: error,
    });
  },

  playNext: () => {
    const current = musicStore.get();
    if (current.currentTrack && current.playlist.length > 0) {
      const currentIndex = current.playlist.findIndex(t => t.id === current.currentTrack!.id);
      const nextIndex = (currentIndex + 1) % current.playlist.length;
      const nextTrack = current.playlist[nextIndex];
      const newState = {
        ...current,
        currentTrack: nextTrack,
      };
      musicStore.set(newState);
      
      // Persist track change
      saveToStorage({
        currentTrack: nextTrack,
        volume: newState.volume,
        playlist: newState.playlist,
        isExpanded: newState.isExpanded,
        currentTime: newState.currentTime,
      });
    }
  },

  playPrevious: () => {
    const current = musicStore.get();
    if (current.currentTrack && current.playlist.length > 0) {
      const currentIndex = current.playlist.findIndex(t => t.id === current.currentTrack!.id);
      const prevIndex = currentIndex === 0 ? current.playlist.length - 1 : currentIndex - 1;
      const prevTrack = current.playlist[prevIndex];
      const newState = {
        ...current,
        currentTrack: prevTrack,
      };
      musicStore.set(newState);
      
      // Persist track change
      saveToStorage({
        currentTrack: prevTrack,
        volume: newState.volume,
        playlist: newState.playlist,
        isExpanded: newState.isExpanded,
        currentTime: newState.currentTime,
      });
    }
  },

  clearPlaylist: () => {
    const newState = {
      ...musicStore.get(),
      playlist: [],
    };
    musicStore.set(newState);
    
    // Persist playlist clearing
    saveToStorage({
      currentTrack: newState.currentTrack,
      volume: newState.volume,
      playlist: [],
      isExpanded: newState.isExpanded,
      currentTime: newState.currentTime,
    });
  },

  shufflePlaylist: () => {
    const current = musicStore.get();
    const shuffled = [...current.playlist].sort(() => Math.random() - 0.5);
    const newState = {
      ...current,
      playlist: shuffled,
    };
    musicStore.set(newState);
    
    // Persist shuffled playlist
    saveToStorage({
      currentTrack: newState.currentTrack,
      volume: newState.volume,
      playlist: shuffled,
      isExpanded: newState.isExpanded,
      currentTime: newState.currentTime,
    });
  },

  // New actions for audio management
  seek: (time: number) => {
    audioManager.seek(time);
    
    // Immediately save timestamp on manual seek
    const state = musicStore.get();
    if (state.currentTrack) {
      saveToStorage({
        currentTrack: state.currentTrack,
        volume: state.volume,
        playlist: state.playlist,
        isExpanded: state.isExpanded,
        currentTime: time,
      });
    }
  },

  // Set current time with immediate save (for manual seeks)
  setCurrentTimeImmediate: (currentTime: number) => {
    const newState = {
      ...musicStore.get(),
      currentTime,
    };
    musicStore.set(newState);
    
    // Immediate save for manual seeks
    if (newState.currentTrack) {
      saveToStorage({
        currentTrack: newState.currentTrack,
        volume: newState.volume,
        playlist: newState.playlist,
        isExpanded: newState.isExpanded,
        currentTime,
      });
    }
  },

  // Toggle player between mini and expanded states
  toggleExpanded: () => {
    const current = musicStore.get();
    const newExpanded = !current.isExpanded;
    const newState = {
      ...current,
      isExpanded: newExpanded,
    };
    musicStore.set(newState);
    
    // Persist expanded state
    saveToStorage({
      currentTrack: newState.currentTrack,
      volume: newState.volume,
      playlist: newState.playlist,
      isExpanded: newExpanded,
      currentTime: newState.currentTime,
    });
  },

  setPendingTrack: (track: Track | null) => {
    musicStore.set({ ...musicStore.get(), pendingTrack: track });
  },
}; 