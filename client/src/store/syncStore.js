import { create } from 'zustand';
import { syncAPI } from '../api/client';

const useSyncStore = create((set, get) => ({
  // State
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncAt: null,
  syncStatus: null,
  syncProgress: 0,
  syncErrors: [],

  // Actions
  initializeSync: () => {
    // Listen for online/offline events
    const handleOnline = () => set({ isOnline: true });
    const handleOffline = () => set({ isOnline: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial sync status
    get().checkSyncStatus();

    // Set up periodic sync check
    const interval = setInterval(() => {
      get().checkSyncStatus();
    }, 30000); // Check every 30 seconds

    // Cleanup on unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  },

  checkSyncStatus: async () => {
    try {
      const response = await syncAPI.getStatus();
      set({ 
        syncStatus: response.data,
        lastSyncAt: response.data.summary?.last_sync_at ? new Date(response.data.summary.last_sync_at) : null
      });
    } catch (error) {
      const status = error?.response?.status;
      if (status === 403 || status === 401) {
        set({ syncStatus: null });
        return;
      }
      console.error('Check sync status error:', error);
    }
  },

  forceSync: async (direction = 'both') => {
    if (get().isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    set({ isSyncing: true, syncErrors: [] });

    try {
      const response = await syncAPI.force({ direction });
      
      set({ 
        isSyncing: false,
        lastSyncAt: new Date(),
        syncProgress: 100
      });

      return response.data;
    } catch (error) {
      set({ 
        isSyncing: false,
        syncErrors: [error.message || 'Sync failed']
      });
      return { success: false, error: error.message };
    }
  },

  setSyncProgress: (progress) => {
    set({ syncProgress: Math.max(0, Math.min(100, progress)) });
  },

  addSyncError: (error) => {
    set(state => ({
      syncErrors: [...state.syncErrors, error]
    }));
  },

  clearSyncErrors: () => {
    set({ syncErrors: [] });
  },

  // Getters
  getSyncPercentage: () => {
    const status = get().syncStatus;
    if (!status?.summary) return 0;
    
    return status.summary.sync_percentage || 0;
  },

  getSyncStatusText: () => {
    const { isOnline, isSyncing, syncStatus } = get();
    
    if (!isOnline) {
      return 'Offline';
    }
    
    if (isSyncing) {
      return 'Syncing...';
    }
    
    if (syncStatus?.summary) {
      const { total_pending, total_synced } = syncStatus.summary;
      
      if (total_pending > 0) {
        return `${total_pending} pending changes`;
      }
      
      if (total_synced > 0) {
        return `All synced (${total_synced} records)`;
      }
    }
    
    return 'Up to date';
  },

  getLastSyncText: () => {
    const lastSync = get().lastSyncAt;
    
    if (!lastSync) {
      return 'Never synced';
    }
    
    const now = new Date();
    const diffMs = now - lastSync;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return lastSync.toLocaleDateString();
    }
  },

  hasPendingChanges: () => {
    const status = get().syncStatus;
    return status?.summary?.total_pending > 0;
  },

  getConflictsCount: () => {
    const status = get().syncStatus;
    return status?.conflicts?.count || 0;
  }
}));

export { useSyncStore };
