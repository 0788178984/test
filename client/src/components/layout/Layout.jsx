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
  PieChart,
  Award,
  Wallet,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import { storeHeaderLabel, storeReceiptBranding, storeTypeBadge } from '../../utils/storeBrand';
import { isClinicStore } from '../../constants/businessTypes';
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
  const syncSummary = useSyncStore((s) => s.syncStatus?.summary);
  const showHeaderSync = Boolean(syncSummary && syncSummary.sync_enabled !== false);
  const headerCode = storeHeaderLabel(user);
  const { name: storeName } = storeReceiptBranding(user);
  const typeBadge = storeTypeBadge(user);
  const clinicStore = isClinicStore(user);

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
      title: 'Mobile money',
      icon: Smartphone,
      path: '/mobile-money',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: clinicStore ? 'Medicines' : 'Products',
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
      title: 'Expenses',
      icon: Wallet,
      path: '/expenses',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'Reports',
      icon: BarChart3,
      path: '/reports',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Returns & voids',
      icon: Undo2,
      path: '/returns',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Data analysis',
      icon: PieChart,
      path: '/data-analysis',
      roles: ['admin', 'manager'],
    },
    {
      title: 'Notifications',
      icon: Bell,
      path: '/notifications',
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      title: 'Subscription',
      icon: Award,
      path: '/subscription',
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

  const isActivePath = (path) => location.pathname.startsWith(path);

  const closeMobileNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setSidebarOpen(false);
    }
  };

  const navItemClass = (isActive) =>
    `nav-menu-link group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
      isActive ? 'nav-menu-link--active' : ''
    }`;

  const navIconClass = (isActive) =>
    isActive
      ? 'text-white'
      : 'text-gray-500 transition-colors duration-200 group-hover:text-primary-700';

  const iconButtonClass =
    'nav-icon-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

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
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-gray-800">{headerCode}</h1>
            {storeName && storeName !== headerCode ? (
              <p className="truncate text-xs text-gray-500">{storeName}</p>
            ) : null}
            {typeBadge ? (
              <p className="truncate text-xs text-primary-700 font-medium">{typeBadge}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className={`${iconButtonClass} text-gray-600 lg:hidden`}
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
                className={navItemClass(isActive)}
              >
                <Icon className={`h-5 w-5 shrink-0 ${navIconClass(isActive)}`} aria-hidden />
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 hover:text-red-700 active:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
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
                className={`shrink-0 ${iconButtonClass}`}
                aria-expanded={sidebarOpen}
                aria-label={sidebarOpen ? 'Hide navigation menu' : 'Show navigation menu'}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="min-w-0 lg:hidden">
                <p className="truncate text-sm font-bold text-gray-800">{headerCode}</p>
                {storeName && storeName !== headerCode ? (
                  <p className="truncate text-xs text-gray-500">{storeName}</p>
                ) : null}
                {typeBadge ? (
                  <p className="truncate text-xs text-primary-700 font-medium">{typeBadge}</p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4 sm:gap-6">
              {showHeaderSync && (
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
              )}

              <NotificationBell />

              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 active:bg-primary-100 sm:px-3"
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

          {showHeaderSync && (
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
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
