import React, { useState, useEffect, useMemo } from 'react';
import { X, CreditCard, Smartphone, DollarSign, BookOpen } from 'lucide-react';
import { customersAPI, paymentsAPI, formatCurrency, formatPhoneNumber, handleApiError, getStoreToday } from '../../api/client';
import Currency from '../ui/Currency';
import { toast } from 'react-hot-toast';
import Button from '../ui/Button';

const ALL_METHODS = [
  { id: 'cash', name: 'Cash', icon: DollarSign, color: 'green' },
  { id: 'mtn_momo', name: 'MTN MoMo', icon: Smartphone, color: 'yellow' },
  { id: 'airtel_money', name: 'Airtel Money', icon: CreditCard, color: 'blue' },
  { id: 'credit', name: 'On Credit', icon: BookOpen, color: 'purple' },
];

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Payment UI — render inside parent <Modal>; do not nest another Modal here.
 * @param {object} [paymentMethods] — from auth: { cash, mtn_momo, airtel_money }
 * @param {boolean} [canUseCredit] — admin/manager with credit-enabled customer
 */
const PaymentModal = ({ totalAmount, customer, paymentMethods, canUseCredit, onPayment, onCancel }) => {
  const methods = useMemo(
    () =>
      ALL_METHODS.filter((m) => {
        if (m.id === 'credit') return canUseCredit && customer?.credit_enabled;
        if (m.id === 'cash') return true;
        return paymentMethods && paymentMethods[m.id] === true;
      }),
    [paymentMethods, canUseCredit, customer]
  );

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [cashTendered, setCashTendered] = useState(totalAmount);
  const [creditPaidNow, setCreditPaidNow] = useState(0);
  const [creditDueDate, setCreditDueDate] = useState(() => addDaysISO(30));
  const [reference, setReference] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const first = methods[0]?.id || 'cash';
    if (!methods.find((m) => m.id === paymentMethod)) {
      setPaymentMethod(first);
    }
  }, [methods, paymentMethod]);

  useEffect(() => {
    if (paymentMethod === 'cash') {
      setCashTendered(Math.round(Number(totalAmount) || 0));
    }
    if (paymentMethod === 'credit') {
      setCreditPaidNow(0);
    }
  }, [totalAmount, paymentMethod]);

  useEffect(() => {
    if (customer?.phone) {
      setPhoneNumber(formatPhoneNumber(customer.phone));
    }
  }, [customer]);

  const handleCustomerSearch = async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await customersAPI.getAll({ search: query, limit: 20 });
      setSearchResults(response.data.customers || []);
    } catch (error) {
      console.error('Customer search error:', error);
      setSearchResults([]);
    }
  };

  const handleCustomerSelect = (selectedCustomer) => {
    setPhoneNumber(formatPhoneNumber(selectedCustomer.phone || ''));
    setSearchQuery(selectedCustomer.name || '');
    setSearchResults([]);
  };

  const submitCash = () => {
    const tender = Math.round(Number(cashTendered) || 0);
    const due = Math.round(Number(totalAmount) || 0);
    if (tender < due) {
      return;
    }
    onPayment({
      method: 'cash',
      amountPaid: tender,
      changeGiven: tender - due,
      reference: '',
    });
  };

  const submitCredit = () => {
    const due = Math.round(Number(totalAmount) || 0);
    const paidNow = Math.round(Number(creditPaidNow) || 0);
    if (paidNow > due) {
      toast.error('Amount paid now cannot exceed total.');
      return;
    }
    if (!creditDueDate) {
      toast.error('Set a due date for the credit balance.');
      return;
    }
    onPayment({
      method: 'credit',
      amountPaid: paidNow,
      changeGiven: 0,
      reference: '',
      creditDueDate,
      balanceDue: due - paidNow,
    });
  };

  const handlePayClick = async () => {
    if (paymentMethod === 'cash') {
      submitCash();
      return;
    }

    if (paymentMethod === 'credit') {
      submitCredit();
      return;
    }

    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 9) {
      toast.error('Enter a valid payer phone number for mobile money.');
      return;
    }

    setIsProcessing(true);
    setReference('');
    try {
      const amount = Math.round(Number(totalAmount) || 0);
      const { data } = await paymentsAPI.requestCollection({
        method: paymentMethod,
        phone: phoneNumber,
        amount,
        reference: `POS-${Date.now()}`,
      });
      const ref = data.payment_reference || data.transactionId || '';
      setReference(ref);
      onPayment({
        method: paymentMethod,
        amountPaid: amount,
        changeGiven: 0,
        reference: ref,
        phone: phoneNumber,
      });
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getPaymentMethodName = (method) => {
    const payment = methods.find((p) => p.id === method);
    return payment ? payment.name : 'Cash';
  };

  const tenderOk =
    paymentMethod === 'credit'
      ? true
      : paymentMethod !== 'cash' ||
        (Number(cashTendered) || 0) + 0.001 >= (Number(totalAmount) || 0);

  const creditBalanceDue = Math.max(0, (Number(totalAmount) || 0) - (Number(creditPaidNow) || 0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Complete payment</h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="rounded-lg bg-gray-50 p-6">
        <div className="text-center">
          <p className="text-sm text-gray-600">Total due</p>
          <Currency amount={totalAmount} className="stat-value-currency text-primary-600" amountClassName="text-primary-600" />
        </div>
      </div>

      {customer && (
        <div className="rounded-lg bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-medium text-blue-800">Customer</h3>
          <p className="text-sm">
            <span className="font-medium">Name:</span> {customer.name}
          </p>
          <p className="text-sm">
            <span className="font-medium">Phone:</span> {formatPhoneNumber(customer.phone || '')}
          </p>
          <p className="text-sm">
            <span className="font-medium">Loyalty:</span> {customer.loyalty_points} pts
          </p>
          {customer.credit_enabled ? (
            <>
              <p className="text-sm">
                <span className="font-medium">Credit balance:</span>{' '}
                {formatCurrency(customer.credit_balance || 0)}
              </p>
              {customer.credit_limit > 0 && (
                <p className="text-sm">
                  <span className="font-medium">Credit limit:</span>{' '}
                  {formatCurrency(customer.credit_limit)}
                </p>
              )}
            </>
          ) : null}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Payment method</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {methods.map((method) => {
            const Icon = method.icon;
            const active = paymentMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setPaymentMethod(method.id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  active
                    ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-200'
                    : 'border-gray-200 hover:border-primary-300'
                } `}
              >
                <Icon className={`mb-2 h-8 w-8 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
                <p className="font-medium text-gray-900">{method.name}</p>
              </button>
            );
          })}
        </div>
      </div>

      {paymentMethod === 'credit' && (
        <div className="space-y-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm text-violet-900">
            Record a credit sale. Stock is reduced now; customer pays the balance later.
          </p>
          <div>
            <label className="form-label">Amount paid now (UGX, optional)</label>
            <input
              type="number"
              min={0}
              max={totalAmount}
              step="1"
              value={creditPaidNow}
              onChange={(e) => setCreditPaidNow(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Balance due</label>
            <p className="text-lg font-bold text-violet-800">{formatCurrency(creditBalanceDue)}</p>
          </div>
          <div>
            <label className="form-label">Payment due date</label>
            <input
              type="date"
              min={getStoreToday()}
              value={creditDueDate}
              onChange={(e) => setCreditDueDate(e.target.value)}
              className="form-input"
            />
          </div>
        </div>
      )}

      {paymentMethod === 'cash' && (
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
          <div>
            <label className="form-label">Cash received (UGX)</label>
            <input
              type="number"
              min={0}
              step="1"
              value={cashTendered === '' ? '' : cashTendered}
              onChange={(e) => {
                const v = e.target.value;
                setCashTendered(v === '' ? '' : parseFloat(v));
              }}
              className="form-input text-lg font-semibold"
            />
            <p className="mt-2 text-sm text-gray-600">
              Change to give:{' '}
              <span className="font-bold text-primary-700">
                {formatCurrency(Math.max(0, (Number(cashTendered) || 0) - (Number(totalAmount) || 0)))}
              </span>
            </p>
            {!tenderOk && (
              <p className="mt-1 text-sm text-red-600">Amount received must cover the total.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[500, 1000, 5000, 10000, 20000, 50000].map((note) => (
              <button
                key={note}
                type="button"
                className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                onClick={() => setCashTendered((v) => (Number(v) || 0) + note)}
              >
                +{formatCurrency(note)}
              </button>
            ))}
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setCashTendered(Math.round(Number(totalAmount) || 0))}
            >
              Exact
            </button>
          </div>
        </div>
      )}

      {paymentMethod !== 'cash' && paymentMethod !== 'credit' && (
        <div className="space-y-4">
          <div>
            <label className="form-label">Payer phone (MoMo)</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="0756… or +256…"
              className="form-input"
            />
            {customer && (
              <button
                type="button"
                className="mt-2 text-sm text-primary-600 hover:underline"
                onClick={() => handleCustomerSelect(customer)}
              >
                Use attached customer phone
              </button>
            )}
          </div>

          {!customer && (
            <div className="relative">
              <label className="form-label">Search customer (optional)</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchQuery(q);
                  handleCustomerSearch(q);
                }}
                placeholder="Name or phone…"
                className="form-input"
              />
              {searchResults.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {searchResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => handleCustomerSelect(c)}
                      >
                        {c.name} — {formatPhoneNumber(c.phone || '')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {reference && paymentMethod !== 'cash' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">Provider reference</p>
          <p className="text-sm text-green-700">{reference}</p>
        </div>
      )}

      {isProcessing && paymentMethod !== 'cash' && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent" />
          <p className="text-sm text-yellow-800">Requesting {getPaymentMethodName(paymentMethod)}…</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={isProcessing} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handlePayClick}
          disabled={isProcessing || !tenderOk}
          className="flex-1"
        >
          {paymentMethod === 'cash'
            ? 'Confirm cash sale'
            : paymentMethod === 'credit'
              ? `Confirm credit sale (${formatCurrency(creditBalanceDue)} due)`
              : `Confirm ${getPaymentMethodName(paymentMethod)}`}
        </Button>
      </div>
    </div>
  );
};

export default PaymentModal;
