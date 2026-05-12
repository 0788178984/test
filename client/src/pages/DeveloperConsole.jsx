import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Bell, LifeBuoy, RefreshCw, PlusCircle, UserPlus, AlertTriangle } from 'lucide-react';
import { developerAPI } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import NotificationBell from '../components/notifications/NotificationBell';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { toast } from 'react-hot-toast';

export default function DeveloperConsole() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const connectEventStream = useNotificationStore((s) => s.connectEventStream);
  const disconnectEventStream = useNotificationStore((s) => s.disconnectEventStream);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notify, setNotify] = useState({ id: '', title: '', message: '' });
  const [patch, setPatch] = useState({ id: '', status: 'active', expires: '' });

  const [supportRequests, setSupportRequests] = useState([]);
  const [supportLoading, setSupportLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [ticketStatus, setTicketStatus] = useState('open');
  const [ticketNotes, setTicketNotes] = useState('');
  const [ticketSaving, setTicketSaving] = useState(false);

  const [newStore, setNewStore] = useState({
    name: '',
    business_code: '',
    subscription_status: 'trial',
    expires: '',
    notes: '',
  });
  const [creatingStore, setCreatingStore] = useState(false);

  const [bootstrap, setBootstrap] = useState({
    businessId: '',
    name: '',
    email: '',
    password: '',
    pin: '',
  });
  const [bootstrapSaving, setBootstrapSaving] = useState(false);

  const [licenseAlerts, setLicenseAlerts] = useState({
    out_of_licence: [],
    expiring_soon: [],
    expiring_this_month: [],
  });
  const [alertsLoading, setAlertsLoading] = useState(true);

  const loadLicenseAlerts = async () => {
    setAlertsLoading(true);
    try {
      const { data } = await developerAPI.licenseAlerts();
      setLicenseAlerts({
        out_of_licence: data.out_of_licence || [],
        expiring_soon: data.expiring_soon || [],
        expiring_this_month: data.expiring_this_month || [],
      });
    } catch {
      toast.error('Could not load licence alerts');
    } finally {
      setAlertsLoading(false);
    }
  };

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const { data } = await developerAPI.listBusinesses();
      setBusinesses(data.businesses || []);
    } catch {
      toast.error('Could not load businesses');
    } finally {
      setLoading(false);
    }
  };

  const loadSupport = async () => {
    setSupportLoading(true);
    try {
      const { data } = await developerAPI.listSupportAll();
      setSupportRequests(data.requests || []);
    } catch {
      toast.error('Could not load support tickets');
    } finally {
      setSupportLoading(false);
    }
  };

  useEffect(() => {
    loadBusinesses();
    loadSupport();
    loadLicenseAlerts();
  }, []);

  useEffect(() => {
    fetchNotifications({ limit: 20 });
    connectEventStream();
    return () => disconnectEventStream();
  }, [connectEventStream, disconnectEventStream, fetchNotifications]);

  useEffect(() => {
    const t = supportRequests.find((r) => r.id === selectedTicketId);
    if (t) {
      setTicketStatus(t.status || 'open');
      setTicketNotes(t.developer_notes || '');
    } else {
      setTicketStatus('open');
      setTicketNotes('');
    }
  }, [selectedTicketId, supportRequests]);

  const sendNotify = async (e) => {
    e.preventDefault();
    if (!notify.id || !notify.title || !notify.message) {
      toast.error('Pick a store and enter title + message');
      return;
    }
    try {
      await developerAPI.notifyStaff(notify.id, { title: notify.title, message: notify.message });
      toast.success('Notification sent to store admins/managers');
      setNotify((n) => ({ ...n, title: '', message: '' }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to notify');
    }
  };

  const saveLicense = async (e) => {
    e.preventDefault();
    if (!patch.id) {
      toast.error('Select a store');
      return;
    }
    try {
      await developerAPI.updateBusiness(patch.id, {
        subscription_status: patch.status,
        subscription_expires_at: patch.expires || null,
      });
      toast.success('Subscription updated');
      loadBusinesses();
      loadLicenseAlerts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const saveTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicketId) {
      toast.error('Select a ticket in the table');
      return;
    }
    setTicketSaving(true);
    try {
      await developerAPI.updateSupport(selectedTicketId, {
        status: ticketStatus,
        developer_notes: ticketNotes,
      });
      toast.success('Ticket updated');
      await loadSupport();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setTicketSaving(false);
    }
  };

  const selectedTicket = supportRequests.find((r) => r.id === selectedTicketId);

  const createStore = async (e) => {
    e.preventDefault();
    const name = newStore.name.trim();
    const code = newStore.business_code.trim().toUpperCase();
    if (!name || !code) {
      toast.error('Store name and business code are required.');
      return;
    }
    setCreatingStore(true);
    try {
      await developerAPI.createBusiness({
        name,
        business_code: code,
        subscription_status: newStore.subscription_status,
        subscription_expires_at: newStore.expires.trim() || null,
        notes: newStore.notes.trim() || null,
      });
      toast.success(`Supermarket created. Staff sign in with store code: ${code}`);
      setNewStore({
        name: '',
        business_code: '',
        subscription_status: 'trial',
        expires: '',
        notes: '',
      });
      await loadBusinesses();
      await loadLicenseAlerts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create store');
    } finally {
      setCreatingStore(false);
    }
  };

  const bootstrapAdmin = async (e) => {
    e.preventDefault();
    if (!bootstrap.businessId || !bootstrap.name.trim() || !bootstrap.email.trim() || !bootstrap.password) {
      toast.error('Select a store and fill name, email, and password.');
      return;
    }
    if (bootstrap.password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (bootstrap.pin && !/^\d{4}$/.test(bootstrap.pin)) {
      toast.error('PIN must be exactly 4 digits, or leave empty.');
      return;
    }
    setBootstrapSaving(true);
    try {
      await developerAPI.bootstrapAdmin(bootstrap.businessId, {
        name: bootstrap.name.trim(),
        email: bootstrap.email.trim().toLowerCase(),
        password: bootstrap.password,
        ...(bootstrap.pin ? { pin: bootstrap.pin } : {}),
      });
      toast.success('Admin created. They can use Web login or PIN (if set).');
      setBootstrap((b) => ({ ...b, name: '', email: '', password: '', pin: '' }));
      await loadBusinesses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create admin');
    } finally {
      setBootstrapSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary-600" />
          <h1 className="text-lg font-semibold text-gray-900">Developer console</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell />
          <Button
            variant="secondary"
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Back to login
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Log out
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              Licence status
            </h2>
            <Button type="button" variant="secondary" onClick={loadLicenseAlerts} disabled={alertsLoading}>
              {alertsLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            Out-of-licence stores need renewal. “Ending soon” is within 14 days of expiry. “This month” is 15–30 days. You
            also get a daily <strong>in-app digest</strong> on the bell when there is anything to review. Store{' '}
            <strong>admins and managers</strong> get reminders (and the same digest pattern for their own store via
            scheduled notifications).
          </p>
          {alertsLoading ? (
            <p className="text-sm text-gray-500">Loading alerts…</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-red-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-red-700">Out of licence</p>
                <p className="text-2xl font-bold text-red-800 mt-1">{licenseAlerts.out_of_licence.length}</p>
                <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-gray-700 space-y-1">
                  {licenseAlerts.out_of_licence.map((b) => (
                    <li key={b.id}>
                      <span className="font-mono text-xs">{b.business_code}</span> — {b.name}{' '}
                      <span className="text-gray-500">({b.subscription_status})</span>
                    </li>
                  ))}
                  {licenseAlerts.out_of_licence.length === 0 && (
                    <li className="text-gray-500">None — all stores licensed.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-orange-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-orange-800">Ending within 14 days</p>
                <p className="text-2xl font-bold text-orange-900 mt-1">{licenseAlerts.expiring_soon.length}</p>
                <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-gray-700 space-y-1">
                  {licenseAlerts.expiring_soon.map((b) => (
                    <li key={b.id}>
                      <span className="font-mono text-xs">{b.business_code}</span> — {b.name}{' '}
                      <span className="text-gray-500">({b.days_until_expiry}d)</span>
                    </li>
                  ))}
                  {licenseAlerts.expiring_soon.length === 0 && (
                    <li className="text-gray-500">No stores in this window.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-amber-300 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-amber-900">15–30 days left</p>
                <p className="text-2xl font-bold text-amber-950 mt-1">{licenseAlerts.expiring_this_month.length}</p>
                <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-gray-700 space-y-1">
                  {licenseAlerts.expiring_this_month.map((b) => (
                    <li key={b.id}>
                      <span className="font-mono text-xs">{b.business_code}</span> — {b.name}{' '}
                      <span className="text-gray-500">({b.days_until_expiry}d)</span>
                    </li>
                  ))}
                  {licenseAlerts.expiring_this_month.length === 0 && (
                    <li className="text-gray-500">No stores in this window.</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-md font-semibold text-gray-800 flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary-600" /> Add new supermarket
          </h2>
          <p className="text-sm text-gray-600">
            Each supermarket is a separate tenant with its own <strong>business code</strong> (e.g. <code className="text-gray-800">KAMPALA1</code>). Staff
            enter that code on login. Codes must be unique.
          </p>
          <form onSubmit={createStore} className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Store name"
              value={newStore.name}
              onChange={(e) => setNewStore((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. Ntinda Branch"
              required
            />
            <Input
              label="Business code"
              value={newStore.business_code}
              onChange={(e) => setNewStore((s) => ({ ...s, business_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. KAMPALA1"
              required
            />
            <div>
              <label className="form-label">Initial subscription</label>
              <select
                className="form-input"
                value={newStore.subscription_status}
                onChange={(e) => setNewStore((s) => ({ ...s, subscription_status: e.target.value }))}
              >
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="expired">expired</option>
              </select>
            </div>
            <Input
              label="Expires at (optional)"
              value={newStore.expires}
              onChange={(e) => setNewStore((s) => ({ ...s, expires: e.target.value }))}
              placeholder="2026-12-31"
            />
            <div className="sm:col-span-2">
              <label className="form-label">Internal notes (optional)</label>
              <textarea
                className="form-input min-h-[72px]"
                value={newStore.notes}
                onChange={(e) => setNewStore((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Contract ref, contact person…"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={creatingStore}>
                Create supermarket
              </Button>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-md font-semibold text-gray-800 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary-600" /> Create first admin for a store
          </h2>
          <p className="text-sm text-gray-600">
            New stores have no users until you add at least one admin. They sign in with <strong>Web login</strong> using this email and password.{' '}
            <strong>PIN login</strong> uses the 4-digit PIN you enter here, or <strong>1234</strong> if you leave PIN blank (change it from the store after first login).
          </p>
          <form onSubmit={bootstrapAdmin} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="form-label">Store</label>
              <select
                className="form-input"
                value={bootstrap.businessId}
                onChange={(e) => setBootstrap((b) => ({ ...b, businessId: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.business_code} — {b.name} ({b.user_count} users)
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Admin full name"
              value={bootstrap.name}
              onChange={(e) => setBootstrap((b) => ({ ...b, name: e.target.value }))}
              required
            />
            <Input
              type="email"
              label="Admin email"
              value={bootstrap.email}
              onChange={(e) => setBootstrap((b) => ({ ...b, email: e.target.value }))}
              required
            />
            <Input
              type="password"
              label="Web password (min 8 chars)"
              value={bootstrap.password}
              onChange={(e) => setBootstrap((b) => ({ ...b, password: e.target.value }))}
              required
            />
            <Input
              label="4-digit PIN (optional)"
              value={bootstrap.pin}
              onChange={(e) => setBootstrap((b) => ({ ...b, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="1234"
              maxLength={4}
            />
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={bootstrapSaving}>
                Create admin
              </Button>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4" /> Licensed supermarkets
          </h2>
          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Id</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Expires</th>
                    <th className="py-2">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b) => (
                    <tr key={b.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-mono text-xs">{b.id}</td>
                      <td className="py-2 pr-4 font-mono">{b.business_code}</td>
                      <td className="py-2 pr-4">{b.name}</td>
                      <td className="py-2 pr-4 capitalize">{b.subscription_status}</td>
                      <td className="py-2 pr-4">{b.subscription_expires_at || '—'}</td>
                      <td className="py-2">{b.user_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-md font-semibold text-gray-800">Update subscription</h2>
          <form onSubmit={saveLicense} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label">Store</label>
              <select
                className="form-input"
                value={patch.id}
                onChange={(e) => setPatch((p) => ({ ...p, id: e.target.value }))}
              >
                <option value="">Select…</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.business_code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select
                className="form-input"
                value={patch.status}
                onChange={(e) => setPatch((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="active">active</option>
                <option value="trial">trial</option>
                <option value="suspended">suspended</option>
                <option value="expired">expired</option>
              </select>
            </div>
            <Input
              label="Expires at (ISO date or empty)"
              value={patch.expires}
              onChange={(e) => setPatch((p) => ({ ...p, expires: e.target.value }))}
              placeholder="2026-12-31"
            />
            <div className="flex items-end">
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-md font-semibold text-gray-800 flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" /> Message store admins / managers
          </h2>
          <p className="text-sm text-gray-600">
            Sends an in-app notification to admins and managers at the selected store. They cannot reply here; they use{' '}
            <strong>Help &amp; support</strong> to open a ticket.
          </p>
          <form onSubmit={sendNotify} className="space-y-3">
            <div>
              <label className="form-label">Store</label>
              <select
                className="form-input"
                value={notify.id}
                onChange={(e) => setNotify((n) => ({ ...n, id: e.target.value }))}
              >
                <option value="">Select…</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.business_code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Title"
              value={notify.title}
              onChange={(e) => setNotify((n) => ({ ...n, title: e.target.value }))}
            />
            <div>
              <label className="form-label">Message</label>
              <textarea
                className="form-input min-h-[100px]"
                value={notify.message}
                onChange={(e) => setNotify((n) => ({ ...n, message: e.target.value }))}
              />
            </div>
            <Button type="submit" variant="primary">
              Send notification
            </Button>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-md font-semibold text-gray-800 flex items-center gap-2">
              <LifeBuoy className="h-4 w-4" /> Support inbox
            </h2>
            <Button type="button" variant="secondary" onClick={loadSupport}>
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </span>
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            Help requests from stores appear here and as bell notifications. Update status and add internal notes (visible
            to store admins/managers when you resolve or close).
          </p>

          {supportLoading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="py-2 px-2">Store</th>
                    <th className="py-2 pr-2">Subject</th>
                    <th className="py-2 pr-2">From</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {supportRequests.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedTicketId(r.id)}
                      className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        selectedTicketId === r.id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="py-2 px-2 text-xs">
                        <span className="font-mono">{r.business_code}</span>
                        <div className="text-gray-600 truncate max-w-[8rem]">{r.business_name}</div>
                      </td>
                      <td className="py-2 pr-2 max-w-[12rem] truncate">{r.subject}</td>
                      <td className="py-2 pr-2">{r.from_name}</td>
                      <td className="py-2 pr-2 capitalize">{r.status}</td>
                      <td className="py-2 pr-2 text-xs text-gray-500">{r.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTicket && (
            <form onSubmit={saveTicket} className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-800">{selectedTicket.subject}</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedTicket.body}</p>
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={ticketStatus} onChange={(e) => setTicketStatus(e.target.value)}>
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </div>
              <div>
                <label className="form-label">Notes to store (optional)</label>
                <textarea
                  className="form-input min-h-[80px]"
                  value={ticketNotes}
                  onChange={(e) => setTicketNotes(e.target.value)}
                  placeholder="Visible to admins/managers when ticket is updated…"
                />
              </div>
              <Button type="submit" variant="primary" loading={ticketSaving}>
                Save ticket
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
