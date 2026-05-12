import { create } from 'zustand';
import { notificationsAPI } from '../api/client';

const useNotificationStore = create((set, get) => ({
  // State
  notifications: [],
  unreadCount: 0,
  isConnected: false,
  eventSource: null,

  // Actions
  fetchNotifications: async (params = {}) => {
    try {
      const [listRes, countRes] = await Promise.all([
        notificationsAPI.getAll(params),
        notificationsAPI.getCount(),
      ]);
      const data = listRes.data || {};
      const unread = typeof countRes.data?.count === 'number' ? countRes.data.count : 0;
      set({
        notifications: data.notifications || [],
        unreadCount: unread,
      });
      return data;
    } catch (error) {
      console.error('Fetch notifications error:', error);
      set({ notifications: [], unreadCount: 0 });
      return { notifications: [], pagination: {} };
    }
  },

  markAsRead: async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      set(state => ({
        notifications: state.notifications.map(notif =>
          notif.id === id ? { ...notif, is_read: 1 } : notif
        ),
        unreadCount: Math.max(0, state.unreadCount - 1)
      }));
    } catch (error) {
      console.error('Mark notification as read error:', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationsAPI.markAllAsRead();
      set(state => ({
        notifications: state.notifications.map(notif => ({ ...notif, is_read: 1 })),
        unreadCount: 0
      }));
    } catch (error) {
      console.error('Mark all notifications as read error:', error);
    }
  },

  addNotification: (notification) => {
    set(state => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.is_read ? 0 : 1)
    }));
  },

  removeNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(notif => notif.id !== id),
      unreadCount: Math.max(0, state.unreadCount - 1)
    }));
  },

  connectEventStream: () => {
    if (get().eventSource) {
      return; // Already connected
    }

    try {
      const eventSource = new EventSource(notificationsAPI.stream());
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'unread_count') {
            set({ unreadCount: data.count });
          } else if (data.type === 'notification' || (data.id && data.title != null)) {
            set((state) => ({
              notifications: [data, ...state.notifications],
              unreadCount: state.unreadCount + (data.is_read ? 0 : 1),
            }));
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };

      eventSource.onopen = () => {
        console.log('Connected to notification stream');
        set({ isConnected: true, eventSource });
      };

      eventSource.onerror = (error) => {
        console.error('Notification stream error:', error);
        set({ isConnected: false });
        
        // Try to reconnect after 5 seconds
        setTimeout(() => {
          get().connectEventStream();
        }, 5000);
      };

      set({ eventSource });
    } catch (error) {
      console.error('Failed to connect to notification stream:', error);
      set({ isConnected: false });
    }
  },

  disconnectEventStream: () => {
    const eventSource = get().eventSource;
    if (eventSource) {
      eventSource.close();
      set({ eventSource: null, isConnected: false });
    }
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  // Getters
  getUnreadNotifications: () => {
    return get().notifications.filter(notif => !notif.is_read);
  },

  getNotificationsByType: (type) => {
    return get().notifications.filter(notif => notif.type === type);
  },

  getNotificationsBySeverity: (severity) => {
    return get().notifications.filter(notif => notif.severity === severity);
  },

  getRecentNotifications: (limit = 10) => {
    return get().notifications.slice(0, limit);
  }
}));

export { useNotificationStore };
