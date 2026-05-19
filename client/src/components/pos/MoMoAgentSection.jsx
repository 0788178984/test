import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Smartphone, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { agentFloatAPI, formatCurrency, formatDate, handleApiError, usersAPI } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

const TX_TYPES = [
  { id: 'withdrawal', label: 'Withdrawal', hint: 'Float ↓ · Cash ↑' },
  { id: 'deposit', label: 'Deposit', hint: 'Float ↑ · Cash ↓' },
  { id: 'airtime', label: 'Airtime', hint: 'Float ↓ · Cash ↑' },
  { id: 'bill_payment', label: 'Bill payment', hint: 'Float ↓ · Cash ↑' },
  { id: 'send_money', label: 'Send money', hint: 'Float ↓ · Cash ↑' },
];

const MOMO_FLOAT_CASHIER_STORAGE_KEY = 'momo-agent-float-cashier-id';

const defaultTxForm = () => ({
  transaction_type: 'withdrawal',
  network: 'mtn',
  amount: '',
  commission: '',
  customer_name: '',
  customer_phone: '',
  reference: '',
  notes: '',
});

const MoMoAgentSection = () => {
  const user = useAuthStore((s) => s.user);
  const hasRole = useAuthStore((s) => s.hasRole);
  const isSupervisor = user && ['admin', 'manager'].includes(user.role);
  const canViewSection = hasRole('admin', 'manager', 'cashier');
  const canManageSession = hasRole('admin', 'manager');
  const canRecordTx = hasRole('admin', 'manager', 'cashier');

  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [balances, setBalances] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [selectedCashierId, setSelectedCashierId] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openForm, setOpenForm] = useState({ opening_cash: '', opening_float: '' });
  const [txForm, setTxForm] = useState(defaultTxForm);
  const [closeForm, setCloseForm] = useState({ closing_cash_actual: '', closing_float_actual: '', notes: '' });

  const cashiersRef = useRef(cashiers);
  cashiersRef.current = cashiers;

  const persistCashierChoice = (id) => {
    setSelectedCashierId(id);
    try {
      localStorage.setItem(MOMO_FLOAT_CASHIER_STORAGE_KEY, id);
    } catch (_) {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    if (!canViewSection) return;
    setLoading(true);
    try {
      if (isSupervisor) {
        let list = cashiersRef.current;
        if (list.length === 0) {
          const { data } = await usersAPI.getDirectory();
          list = (data.users || []).filter((u) => u.role === 'cashier');
          setCashiers(list);
          cashiersRef.current = list;
        }

        let pick =
          selectedCashierId && list.some((u) => u.id === selectedCashierId) ? selectedCashierId : null;
        if (!pick) {
          try {
            const saved = localStorage.getItem(MOMO_FLOAT_CASHIER_STORAGE_KEY);
            if (saved && list.some((u) => u.id === saved)) pick = saved;
          } catch (_) {
            /* ignore */
          }
        }
        if (!pick && list[0]) pick = list[0].id;

        if (pick && pick !== selectedCashierId) {
          setSelectedCashierId(pick);
        }

        if (!pick) {
          setSession(null);
          setBalances(null);
          setTransactions([]);
          return;
        }

        const cid = String(pick).trim();
        const { data } = await agentFloatAPI.getTodaySession({ cashier_id: cid });
        setSession(data.session);
        setBalances(data.balances);
        setTransactions(data.transactions || []);
        return;
      }

      const { data } = await agentFloatAPI.getTodaySession({});
      setSession(data.session);
      setBalances(data.balances);
      setTransactions(data.transactions || []);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [canViewSection, isSupervisor, selectedCashierId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenSession = async (e) => {
    e.preventDefault();
    if (!selectedCashierId) {
      toast.error('Select which cashier is receiving this float.');
      return;
    }
    try {
      await agentFloatAPI.openSession({
        opening_cash: Number(openForm.opening_cash),
        opening_float: Number(openForm.opening_float),
        cashier_id: String(selectedCashierId).trim(),
      });
      toast.success('Float opened for today');
      setOpenModal(false);
      setOpenForm({ opening_cash: '', opening_float: '' });
      load();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const handleRecordTx = async (e) => {
    e.preventDefault();
    if (!session || session.status !== 'open') {
      toast.error('Supervisor must open today’s float for this counter first.');
      return;
    }
    if (isSupervisor && !selectedCashierId) {
      toast.error('Select a cashier.');
      return;
    }
    try {
      const { data } = await agentFloatAPI.recordTransaction({
        ...txForm,
        amount: Number(txForm.amount),
        commission: Number(txForm.commission) || 0,
        ...(isSupervisor ? { cashier_id: String(selectedCashierId).trim() } : {}),
      });
      setBalances(data.balances);
      setTxForm(defaultTxForm());
      toast.success('Transaction recorded');
      load();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    if (!selectedCashierId) {
      toast.error('Select which cashier’s session you are closing.');
      return;
    }
    try {
      await agentFloatAPI.closeSession({
        closing_cash_actual: Number(closeForm.closing_cash_actual),
        closing_float_actual: Number(closeForm.closing_float_actual),
        notes: closeForm.notes,
        cashier_id: String(selectedCashierId).trim(),
      });
      toast.success('Day reconciled');
      setCloseModal(false);
      load();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  if (!canViewSection) return null;

  const isOpen = session?.status === 'open';

  return (
    <section className="rounded-xl border-2 border-amber-200 bg-gradient-to-b from-amber-50/80 to-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Smartphone className="h-5 w-5 text-amber-600" />
            Mobile money agent — float & balancing
          </h2>
          <p className="text-sm text-gray-600">
            Separate from POS checkout MoMo. Only an admin or manager can open or close the day’s
            float; cashiers record agent transactions once float is open.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {!session && canManageSession && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isSupervisor && (!selectedCashierId || cashiers.length === 0)}
              title={
                isSupervisor && !cashiers.length
                  ? 'Add an active cashier under Users first'
                  : undefined
              }
              onClick={() => setOpenModal(true)}
            >
              Open today&apos;s float
            </Button>
          )}
          {isOpen && canManageSession && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSupervisor && !selectedCashierId}
              onClick={() => {
                setCloseForm({
                  closing_cash_actual: String(balances?.current_cash ?? ''),
                  closing_float_actual: String(balances?.current_float ?? ''),
                  notes: '',
                });
                setCloseModal(true);
              }}
            >
              End-of-day reconcile
            </Button>
          )}
        </div>
      </div>

      {isSupervisor && (
        <div className="mb-4 max-w-xl rounded-lg border border-amber-100 bg-white/80 p-3">
          <label className="block text-sm font-medium text-gray-800">Which cashier is this float for?</label>
          <select
            className="form-input mt-1 w-full"
            value={selectedCashierId || ''}
            onChange={(e) => persistCashierChoice(e.target.value)}
          >
            {cashiers.length === 0 ? (
              <option value="">No active cashiers — add staff in Users</option>
            ) : (
              cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <p className="mt-2 text-xs text-gray-600">
            Open and reconcile always apply to the cashier selected here. Choose the counter staff
            who receives the physical cash and MoMo float for the shift.
          </p>
        </div>
      )}

      {!session ? (
        <p className="rounded-lg border border-dashed border-amber-300 bg-white p-4 text-sm text-gray-700">
          {canManageSession ? (
            <>
              As a supervisor, choose the cashier above, then use <strong>Open today&apos;s float</strong>{' '}
              to record how much cash and mobile money float they received (for example UGX 500,000
              each).
            </>
          ) : (
            <>
              Your supervisor must open today&apos;s cash and mobile money float for you before you
              can record agent transactions (withdrawals, deposits, etc.).
            </>
          )}
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <BalanceCard label="Cash at hand" value={balances?.current_cash} />
            <BalanceCard label="MoMo float" value={balances?.current_float} />
            <BalanceCard label="Withdrawals" value={balances?.total_withdrawals} muted />
            <BalanceCard label="Deposits" value={balances?.total_deposits} muted />
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Cashier:{' '}
            <span className="font-medium text-gray-800">{session.cashier_name || '—'}</span>
            {' · '}
            Opening: cash {formatCurrency(balances?.opening_cash)} · float{' '}
            {formatCurrency(balances?.opening_float)} · Commission{' '}
            {formatCurrency(balances?.total_commission)} · Session{' '}
            <span className="font-medium capitalize">{session.status}</span>
          </p>

          {isOpen && canRecordTx && (
            <form onSubmit={handleRecordTx} className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Record transaction</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-sm">
                  <span className="text-gray-600">Type</span>
                  <select
                    className="form-input mt-1 w-full"
                    value={txForm.transaction_type}
                    onChange={(e) => setTxForm((f) => ({ ...f, transaction_type: e.target.value }))}
                  >
                    {TX_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — {t.hint}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Network</span>
                  <select
                    className="form-input mt-1 w-full"
                    value={txForm.network}
                    onChange={(e) => setTxForm((f) => ({ ...f, network: e.target.value }))}
                  >
                    <option value="mtn">MTN</option>
                    <option value="airtel">Airtel</option>
                  </select>
                </label>
                <Input
                  label="Amount (UGX)"
                  name="amount"
                  type="number"
                  min="1"
                  value={txForm.amount}
                  onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
                <Input
                  label="Commission (UGX)"
                  name="commission"
                  type="number"
                  min="0"
                  value={txForm.commission}
                  onChange={(e) => setTxForm((f) => ({ ...f, commission: e.target.value }))}
                />
                <Input
                  label="Customer name"
                  name="customer_name"
                  value={txForm.customer_name}
                  onChange={(e) => setTxForm((f) => ({ ...f, customer_name: e.target.value }))}
                />
                <Input
                  label="Phone"
                  name="customer_phone"
                  value={txForm.customer_phone}
                  onChange={(e) => setTxForm((f) => ({ ...f, customer_phone: e.target.value }))}
                />
                <Input
                  label="Reference / Txn ID"
                  name="reference"
                  value={txForm.reference}
                  onChange={(e) => setTxForm((f) => ({ ...f, reference: e.target.value }))}
                />
                <Input
                  label="Notes"
                  name="notes"
                  value={txForm.notes}
                  onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="submit" variant="primary">
                  Save transaction
                </Button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Network</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Cash Δ</th>
                  <th className="px-3 py-2">Float Δ</th>
                  <th className="px-3 py-2">Ref</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                      No transactions yet today
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(t.created_at, { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 capitalize">{t.transaction_type.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 uppercase">{t.network}</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(t.amount)}</td>
                      <td className="px-3 py-2 text-green-700">
                        {t.cash_delta > 0 ? '+' : ''}
                        {formatCurrency(t.cash_delta)}
                      </td>
                      <td className="px-3 py-2 text-blue-700">
                        {t.float_delta > 0 ? '+' : ''}
                        {formatCurrency(t.float_delta)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{t.reference || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal isOpen={openModal} onClose={() => setOpenModal(false)} title="Open float — today" size="md">
        <form onSubmit={handleOpenSession} className="space-y-4">
          {isSupervisor && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-gray-800">
              Opening for:{' '}
              <span className="font-semibold">
                {cashiers.find((c) => c.id === selectedCashierId)?.name || '—'}
              </span>
            </p>
          )}
          <Input
            label="Cash float given (UGX)"
            name="opening_cash"
            type="number"
            min="0"
            value={openForm.opening_cash}
            onChange={(e) => setOpenForm((f) => ({ ...f, opening_cash: e.target.value }))}
            required
          />
          <Input
            label="Mobile money float given (UGX)"
            name="opening_float"
            type="number"
            min="0"
            value={openForm.opening_float}
            onChange={(e) => setOpenForm((f) => ({ ...f, opening_float: e.target.value }))}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpenModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Open session
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={closeModal} onClose={() => setCloseModal(false)} title="End-of-day reconciliation" size="md">
        <form onSubmit={handleClose} className="space-y-4">
          <p className="text-sm text-gray-600">
            Expected: cash {formatCurrency(balances?.expected_closing_cash)} · float{' '}
            {formatCurrency(balances?.expected_closing_float)}
          </p>
          <Input
            label="Actual cash counted (UGX)"
            name="closing_cash_actual"
            type="number"
            value={closeForm.closing_cash_actual}
            onChange={(e) => setCloseForm((f) => ({ ...f, closing_cash_actual: e.target.value }))}
            required
          />
          <Input
            label="Actual MoMo float (UGX)"
            name="closing_float_actual"
            type="number"
            value={closeForm.closing_float_actual}
            onChange={(e) => setCloseForm((f) => ({ ...f, closing_float_actual: e.target.value }))}
            required
          />
          <Input
            label="Notes"
            name="notes"
            value={closeForm.notes}
            onChange={(e) => setCloseForm((f) => ({ ...f, notes: e.target.value }))}
            multiline
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCloseModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Close & reconcile
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
};

function BalanceCard({ label, value, muted }) {
  return (
    <div className={`rounded-lg border p-3 ${muted ? 'border-gray-200 bg-gray-50' : 'border-amber-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{formatCurrency(value ?? 0)}</p>
    </div>
  );
}

export default MoMoAgentSection;
