import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { formatDateTime } from '../api/client';

export default function NotificationsPage() {
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const notifications = useNotificationStore((s) => s.notifications);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const data = await fetchNotifications({ page: p, limit: 30 });
      setTotalPages(data.pagination?.pages || 1);
      setPage(data.pagination?.page || p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="h-7 w-7 text-primary-600" />
          Notifications
        </h1>
      </div>

      <Card>
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="text-gray-500">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.is_read && markAsRead(n.id)}
                  className={`w-full text-left py-3 px-1 rounded-lg transition-colors ${
                    n.is_read ? 'bg-white' : 'bg-primary-50/50 hover:bg-primary-50'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-gray-900">{n.title}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {n.created_at ? formatDateTime(n.created_at) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{n.message}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
