import React, { useState, useEffect } from 'react';
import { X, CreditCard, Smartphone, DollarSign } from 'lucide-react';
import { customersAPI } from '../../api/client';
import { formatCurrency, formatPhoneNumber } from '../../api/client';
import Button from '../ui/Button';

/**
 * Payment UI — render inside parent <Modal>; do not nest another Modal here.
 */
const PaymentModal = ({ totalAmount, customer, onPayment, onCancel }) => {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [cashTendered, setCashTendered] = useState(totalAmount);
  const [reference, setReference] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (paymentMethod === 'cash') {
      setCashTendered(Math.round(Number(totalAmount) || 0));
    }
  }, [totalAmount, paymentMethod]);

  useEffect(() => {
    if (customer?.phone) {
      setPhoneNumber(formatPhoneNumber(customer.phone));
    }
  }, [customer]);

  const paymentMethods = [
    { id: 'cash', name: 'Cash', icon: DollarSign, color: 'green' },
    { id: 'mtn_momo', name: 'MTN MoMo', icon: Smartphone, color: 'yellow' },
    { id: 'airtel_money', name: 'Airtel Money', icon: CreditCard, color: 'blue' },
  ];

  const changeDue =
    paymentMethod === 'cash' ? Math.max(0, (Number(cashTendered) || 0) - (Number(totalAmount) || 0)) : 0;

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

  const handlePayClick = async () => {
    if (paymentMethod === 'cash') {
      submitCash();
      return;
    }

    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 9) {
      window.alert('Please enter a valid phone number for mobile money payment.');
      return;
    }

    setIsProcessing(true);
    try {
      const mockReference = `MOCK${Date.now()}`;
      onPayment({
        method: paymentMethod,
        amountPaid: Math.round(Number(totalAmount) || 0),
        changeGiven: 0,
        reference: mockReference,
        phone: phoneNumber,
      });
      setReference(mockReference);
    } catch (error) {
      console.error('Payment processing error:', error);
      window.alert('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getPaymentMethodName = (method) => {
    const payment = paymentMethods.find((p) => p.id === method);
    return payment ? payment.name : 'Cash';
  };

  const tenderOk =
    paymentMethod !== 'cash' ||
    (Number(cashTendered) || 0) + 0.001 >= (Number(totalAmount) || 0);

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
          <p className="text-sm text-gray-600">Total due (incl. VAT)</p>
          <p className="text-3xl font-bold text-primary-600">{formatCurrency(totalAmount)}</p>
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
        </div>
      )}

      <div>
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Payment method</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {paymentMethods.map((method) => {
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
                <p className="text-xs text-gray-500">
                  {method.id === 'cash' ? 'Count cash & change' : 'MoMo (demo reference)'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

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
              Change to give: <span className="font-bold text-primary-700">{formatCurrency(changeDue)}</span>
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

      {paymentMethod !== 'cash' && (
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
          <p className="font-medium text-green-800">Reference</p>
          <p className="text-sm text-green-700">{reference}</p>
        </div>
      )}

      {isProcessing && paymentMethod !== 'cash' && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent" />
          <p className="text-sm text-yellow-800">Processing {getPaymentMethodName(paymentMethod)}…</p>
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
          {paymentMethod === 'cash' ? 'Confirm cash sale' : `Confirm ${getPaymentMethodName(paymentMethod)}`}
        </Button>
      </div>
    </div>
  );
};

export default PaymentModal;
