import React, { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { notificationsAPI, usersAPI } from '../api/client';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

export default function TeamMessages() {
  const user = useAuthStore((s) => s.user);
  const [directory, setDirectory] = useState([]);
  const [targetMode, setTargetMode] = useState('role'); // role | user
  const [targetRole, setTargetRole] = useState('cashier');
  const [targetUserId, setTargetUserId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await usersAPI.getDirectory();
        if (!cancelled) setDirectory(data.users || []);
      } catch {
        if (!cancelled) toast.error('Could not load staff list');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      toast.error('Title and message are required.');
      return;
    }
    const payload =
      targetMode === 'role'
        ? { title: t, message: m, target_role: targetRole }
        : { title: t, message: m, target_user_id: targetUserId };
    if (targetMode === 'user' && !targetUserId) {
      toast.error('Choose a team member.');
      return;
    }
    setSending(true);
    try {
      await notificationsAPI.compose(payload);
      toast.success('Notification sent.');
      setTitle('');
      setMessage('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="h-7 w-7 text-primary-600" />
          Team messages
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Send an in-app notification to everyone with a role, or to one person at this store. Staff cannot message the
          platform developer here — use <strong>Help</strong> in the header for that.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <span className="form-label">Send to</span>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="targetMode"
                  checked={targetMode === 'role'}
                  onChange={() => setTargetMode('role')}
                />
                Whole role
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="targetMode"
                  checked={targetMode === 'user'}
                  onChange={() => setTargetMode('user')}
                />
                One person
              </label>
            </div>
          </div>

          {targetMode === 'role' ? (
            <div>
              <label className="form-label">Role</label>
              <select className="form-input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
                <option value="admin">Admins</option>
                <option value="manager">Managers</option>
                <option value="cashier">Cashiers</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="form-label">Team member</label>
              <select
                className="form-input"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {directory.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                    {u.id === user?.id ? ' — you' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div>
            <label className="form-label">Message</label>
            <textarea
              className="form-input min-h-[120px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <Button type="submit" variant="primary" loading={sending}>
            Send notification
          </Button>
        </form>
      </Card>
    </div>
  );
}
