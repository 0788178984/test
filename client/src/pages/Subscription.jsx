import React from 'react';
import { Award, Building2, Calendar, Hash, Shield } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '../api/client';
import Card from '../components/ui/Card';

const Subscription = () => {
  const { user } = useAuthStore();

  const status = user?.subscription_status || '—';
  const expiresRaw = user?.subscription_expires_at;
  const expires =
    expiresRaw && !Number.isNaN(Date.parse(expiresRaw))
      ? formatDate(expiresRaw, { year: 'numeric', month: 'long', day: 'numeric' })
      : null;
  const expiryDate = expiresRaw && !Number.isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw) : null;
  const daysLeft =
    expiryDate && expiryDate >= new Date()
      ? Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24))
      : null;
  const expired = expiryDate && expiryDate < new Date();

  const statusNote = () => {
    const s = String(status).toLowerCase();
    if (s === 'active') return 'Your store licence is active. Thank you for staying current.';
    if (s === 'trial') return 'You are on a trial. Contact your system provider to move to an active plan before trial limits apply.';
    if (s === 'suspended') return 'This store has been suspended. Use Help & support to reach your system provider.';
    if (s === 'expired') return 'The subscription term has ended. Use Help & support to renew.';
    return 'If anything looks wrong, use Help & support in the header.';
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Award className="h-8 w-8 text-primary-600" />
          Subscription
        </h1>
        <p className="mt-1 text-sm text-gray-600">Licence and term for your supermarket (read-only).</p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Store</p>
            <p className="text-lg font-semibold text-gray-900">{user?.business_name || '—'}</p>
            <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
              <Hash className="h-3.5 w-3.5" />
              Code: <span className="font-mono">{user?.business_code || '—'}</span>
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Status</p>
            <p className="text-lg font-semibold capitalize text-gray-900">{status}</p>
            <p className="text-sm text-gray-600 mt-2">{statusNote()}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 flex items-start gap-3">
          <Calendar className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Term ends</p>
            {expires ? (
              <>
                <p className="text-lg font-semibold text-gray-900">{expires}</p>
                {expired ? (
                  <p className="text-sm text-red-700 mt-1">This date has passed — renew with your system provider.</p>
                ) : daysLeft != null ? (
                  <p className="text-sm text-gray-600 mt-1">
                    About <strong>{daysLeft}</strong> day{daysLeft === 1 ? '' : 's'} remaining on the calendar.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-lg font-medium text-gray-700">No fixed end date on file</p>
            )}
          </div>
        </div>
      </Card>

      <p className="text-xs text-gray-500 text-center">
        Billing and licence changes are done by your system developer. Use <strong>Help</strong> in the menu bar to open a
        ticket.
      </p>
    </div>
  );
};

export default Subscription;
