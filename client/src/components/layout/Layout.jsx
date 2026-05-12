import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  ShoppingCart,
  Package,
  Users,
  Settings,
  LogOut,
  Home,
  BarChart3,
  UserCheck,
  Warehouse,
  Users2,
  RefreshCw,
  LifeBuoy,
  Bell,
  Megaphone,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import { supportAPI } from '../../api/client';
import NotificationBell from '../notifications/NotificationBell';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

const LG = '(min-width: 1024px)';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(LG).matches : true
  );
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasRole, refreshProfile } = useAuthStore();
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState('new');
  const [helpSubject, setHelpSubject] = useState('');
  const [helpBody, setHelpBody] = useState('');
  const [helpSending, setHelpSending] = useState(false);
  const [supportTickets, setSupportTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const isOnline = useSyncStore((s) => s.isOnline);
  const getSyncStatusText = useSyncStore((s) => s.getSyncStatusText);
  const getLastSyncText = useSyncStore((s) => s.getLastSyncText);
  const hasPendingChanges = useSyncStore((s) => s.hasPendingChanges);
  const initializeSync = useSyncStore((s) => s.initializeSync);

  useEffect(() => {
    const cleanup = initializeSync();
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [initializeSync]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const mq = window.matchMedia(LG);
    const onChange = () => {
      if (mq.matches) setSidebarOpen(true);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    if (mq.matches && sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const mq = window.matchMedia('(max-width: 1023px)');
        if (mq.matches) setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const menuItems = [
    {
      title: 'Dashboard',
      icon: Home,
      path: '/dashboard',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'POS',
      icon: ShoppingCart,
      path: '/pos',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'Products',
      icon: Package,
      path: '/products',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Inventory',
      icon: Warehouse,
      path: '/inventory',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'Customers',
      icon: UserCheck,
      path: '/customers',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'Suppliers',
      icon: Users2,
      path: '/suppliers',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Reports',
      icon: BarChart3,
      path: '/reports',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Notifications',
      icon: Bell,
      path: '/notifications',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'Team messages',
      icon: Megaphone,
      path: '/team-messages',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Users',
      icon: Users,
      path: '/users',
      roles: ['admin'],
    },
    {
      title: 'Settings',
      icon: Settings,
      path: '/settings',
      roles: ['admin'],
    },
  ];

  const filteredMenuItems = menuItems.filter((item) =>
    item.roles.some((role) => hasRole(role))
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const loadSupportTickets = React.useCallback(async () => {
    if (user?.role !== 'admin' && user?.role !== 'manager') return;
    setTicketsLoading(true);
    try {
      const { data } = await supportAPI.listForStore();
      setSupportTickets(data.requests || []);
    } catch {
      toast.error('Could not load support tickets.');
    } finally {
      setTicketsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (!helpOpen || helpTab !== 'tickets') return;
    if (user?.role !== 'admin' && user?.role !== 'manager') return;
    loadSupportTickets();
  }, [helpOpen, helpTab, user?.role, loadSupportTickets]);

  const submitHelp = async (e) => {
    e.preventDefault();
    const subject = helpSubject.trim();
    const body = helpBody.trim();
    if (!subject || !body) {
      toast.error('Please enter a subject and message.');
      return;
    }
    setHelpSending(true);
    try {
      await supportAPI.create({ subject, body });
      toast.success('Your request was sent to the system provider.');
      setHelpSubject('');
      setHelpBody('');
      if (user?.role === 'admin' || user?.role === 'manager') {
        setHelpTab('tickets');
        await loadSupportTickets();
      } else {
        setHelpOpen(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send request.');
    } finally {
      setHelpSending(false);
    }
  };

  const showSupportTicketList = user?.role === 'admin' || user?.role === 'manager';

  const subStatus = user?.subscription_status;
  const subExpires = user?.subscription_expires_at;
  const expiryPast =
    subExpires && !Number.isNaN(Date.parse(subExpires)) && new Date(subExpires) < new Date();
  const showSubBanner =
    user?.role &&
    user.role !== 'developer' &&
    (subStatus === 'suspended' ||
      subStatus === 'expired' ||
      subStatus === 'trial' ||
      expiryPast);

  const isActivePath = (path) => location.pathname.startsWith(path);

  const closeMobileNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Modal
        isOpen={helpOpen}
        onClose={() => {
          if (helpSending) return;
          setHelpOpen(false);
          setHelpTab('new');
        }}
        title="Help & support"
        size="md"
      >
        {showSupportTicketList && (
          <div className="flex gap-2 mb-4 border-b border-gray-200 pb-3">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                helpTab === 'new' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setHelpTab('new')}
            >
              New request
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                helpTab === 'tickets' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setHelpTab('tickets')}
            >
              Our tickets
            </button>
          </div>
        )}

        {(!showSupportTicketList || helpTab === 'new') && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              This opens a support ticket for the platform developer. Store staff cannot message the developer from the
              notification bell; use this form for billing, licensing, or technical help.
            </p>
            <form onSubmit={submitHelp} className="space-y-4">
              <Input
                label="Subject"
                value={helpSubject}
                onChange={(e) => setHelpSubject(e.target.value)}
                placeholder="Short summary"
                required
              />
              <div>
                <label className="form-label">Message</label>
                <textarea
                  className="form-input min-h-[120px]"
                  value={helpBody}
                  onChange={(e) => setHelpBody(e.target.value)}
                  placeholder="Describe what you need…"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={helpSending}
                  onClick={() => {
                    setHelpOpen(false);
                    setHelpTab('new');
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={helpSending}>
                  Send request
                </Button>
              </div>
            </form>
          </>
        )}

        {showSupportTicketList && helpTab === 'tickets' && (
          <div className="space-y-2">
            {ticketsLoading ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : supportTickets.length === 0 ? (
              <p className="text-gray-500 text-sm">No tickets yet.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto space-y-3 pr-1">
                {supportTickets.map((t) => (
                  <li key={t.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                    <div className="font-medium text-gray-900">{t.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5 capitalize">
                      {t.status} · {t.created_at}
                      {t.from_name ? ` · from ${t.from_name}` : ''}
                    </div>
                    <p className="text-gray-600 mt-2 whitespace-pre-wrap">{t.body}</p>
                    {t.developer_notes ? (
                      <p className="mt-2 rounded border border-primary-100 bg-primary-50 px-2 py-1.5 text-primary-900">
                        <span className="font-medium">Provider:</span> {t.developer_notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end pt-2">
              <Button type="button" variant="secondary" onClick={() => setHelpOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* Mobile: dim content behind drawer */}
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar: overlay drawer on small screens; column in layout on lg+ */}
      <aside
        className={[
          'flex h-screen max-h-screen w-64 min-w-[16rem] flex-col border-r border-gray-200 bg-white shadow-lg transition-[transform,width,opacity] duration-300 ease-in-out',
          'fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto lg:translate-x-0 lg:shadow-none',
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full pointer-events-none lg:pointer-events-auto lg:translate-x-0',
          sidebarOpen ? 'lg:w-64 lg:min-w-[16rem] lg:opacity-100' : 'lg:w-0 lg:min-w-0 lg:overflow-hidden lg:border-0 lg:opacity-0',
        ].join(' ')}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold text-gray-800">SuperMkt</h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobileNav}
                className={`flex items-center space-x-3 rounded-lg px-3 py-2 transition-all duration-200 ${
                  isActive ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="font-medium">{item.title}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-gray-200 p-4">
          <div className="mb-4 flex items-center space-x-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 font-semibold text-white">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs capitalize text-gray-500">{user?.role}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center space-x-3 rounded-lg px-3 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen((o) => !o)}
                className="shrink-0 rounded-lg p-2 text-gray-700 hover:bg-gray-100"
                aria-expanded={sidebarOpen}
                aria-label={sidebarOpen ? 'Hide navigation menu' : 'Show navigation menu'}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <span className="truncate text-sm font-medium text-gray-500 lg:hidden">
                Menu
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-4 sm:gap-6">
              <div className="hidden text-right sm:block">
                <div className="flex items-center justify-end gap-2">
                  <RefreshCw
                    className={`h-4 w-4 shrink-0 ${hasPendingChanges() ? 'text-yellow-600' : 'text-gray-400'}`}
                  />
                  <div className="text-sm text-gray-600">
                    <div className="font-medium">{getSyncStatusText()}</div>
                    <div className="text-xs text-gray-500">{getLastSyncText()}</div>
                  </div>
                </div>
              </div>

              <NotificationBell />

              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 sm:px-3"
                title="Contact platform support"
              >
                <LifeBuoy className="h-4 w-4 text-primary-600" />
                <span className="hidden sm:inline">Help</span>
              </button>

              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="hidden text-sm text-gray-600 sm:inline">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 sm:hidden">
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${hasPendingChanges() ? 'text-yellow-600' : 'text-gray-400'}`}
            />
            <div className="min-w-0 text-xs text-gray-600">
              <span className="font-medium">{getSyncStatusText()}</span>
              <span className="text-gray-400"> · </span>
              <span className="text-gray-500">{getLastSyncText()}</span>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
          {showSubBanner && (
            <div
              className={`border-b px-4 py-2 text-sm ${
                subStatus === 'suspended' || subStatus === 'expired' || expiryPast
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <strong>Subscription:</strong> {subStatus || 'unknown'}
              {subExpires ? ` · expires ${subExpires}` : ''}
              {subStatus === 'suspended' || subStatus === 'expired' || expiryPast
                ? ' — many features are blocked until your provider reactivates the licence. Use Help & support below.'
                : ' — contact your system provider if this should be active.'}
            </div>
          )}
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
