import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, X } from 'lucide-react';
import { useNotificationStore, isUnread } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';

const NotificationBell = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    connectEventStream,
    disconnectEventStream,
    getUnreadNotifications,
    getRecentNotifications,
  } = useNotificationStore();
  
  const dropdownRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications({ limit: 20 });
  }, [fetchNotifications, user?.id, user?.business_id, user?.role]);

  useEffect(() => {
    if (!user?.id) return;
    connectEventStream();
    const refreshTimer = setInterval(() => {
      fetchNotifications({ limit: 20 });
    }, 60000);
    return () => {
      clearInterval(refreshTimer);
      disconnectEventStream();
    };
  }, [connectEventStream, disconnectEventStream, fetchNotifications, user?.id, user?.business_id, user?.role]);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      const target = event.target;
      if (dropdownRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id) => {
    await markAsRead(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    setIsOpen(false);
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'danger':
        return 'text-red-600 bg-red-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'success':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-blue-600 bg-blue-100';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'danger':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const unreadNotifications = getUnreadNotifications();
  const recentNotifications = getRecentNotifications(5);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-2 transition-colors hover:bg-gray-100"
        aria-expanded={isOpen}
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 text-gray-600" />
        ) : (
          <Bell className="w-5 h-5 text-gray-600" />
        )}
        
        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && createPortal(
        <>
        <button
          type="button"
          className="fixed inset-0 z-[70] bg-black/40 sm:bg-transparent"
          aria-label="Close notifications"
          onClick={() => setIsOpen(false)}
        />
        <div
          ref={panelRef}
          className="fixed inset-x-3 top-28 z-[80] flex max-h-[min(32rem,calc(100dvh-8rem))] w-auto flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:inset-x-auto sm:right-4 sm:top-16 sm:w-96 sm:max-h-[min(32rem,calc(100dvh-5rem))]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 p-3">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <div className="flex shrink-0 items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 sm:text-sm"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No notifications yet</p>
              </div>
            ) : (
              recentNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`cursor-pointer border-b border-gray-100 px-3 py-3 ${
                    isUnread(notification.is_read) ? 'border-l-4 border-l-primary-500 bg-primary-50' : 'bg-white'
                  }`}
                  onClick={() => handleMarkAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 rounded-full p-2 ${getSeverityColor(notification.severity)}`}>
                      <span className="text-sm">{getSeverityIcon(notification.severity)}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <h4 className="min-w-0 font-medium text-gray-900">
                          {notification.title}
                        </h4>
                        <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
                          {formatTime(notification.created_at)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm text-gray-600">
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {recentNotifications.length > 0 && (
            <div className="border-t border-gray-200 p-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/notifications');
                }}
                className="w-full text-center text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default NotificationBell;
