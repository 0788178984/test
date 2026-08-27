import React, { useState, useEffect } from 'react';
import { BookOpen, AlertTriangle, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { creditAPI, formatCurrency, formatDate, handleApiError } from '../api/client';
import Currency from '../components/ui/Currency';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import Card from '../components/ui/Card';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'mtn_momo', label: 'MTN MoMo' },
  { id: 'airtel_money', label: 'Airtel Money' },
  { id: 'bank', label: 'Bank' },
  { id: 'other', label: 'Other' },
];

const CreditReceivables = () => {
  const [receivables, setReceivables] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_method: 'cash',
    payment_reference: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, [overdueOnly]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = overdueOnly ? { overdue_only: 'true' } : {};
      const [recRes, sumRes] = await Promise.all([
        creditAPI.getReceivables(params),
        creditAPI.getSummary(),
      ]);
      setReceivables(recRes.data.receivables || []);
      setSummary(sumRes.data || {});
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const openPayment = (sale) => {
    setSelectedSale(sale);
    setPayForm({
      amount: String(sale.balance_due || ''),
      payment_method: 'cash',
      payment_reference: '',
      notes: '',
    });
    setShowPayModal(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedSale) return;
    try {
      await creditAPI.recordPayment({
        sale_id: selectedSale.id,
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        payment_reference: payForm.payment_reference || undefined,
        notes: payForm.notes || undefined,
      });
      toast.success('Payment recorded');
      setShowPayModal(false);
      setSelectedSale(null);
      fetchData();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const isOverdue = (sale) => {
    if (!sale.credit_due_date) return false;
    return new Date(sale.credit_due_date) < new Date(new Date().toDateString());
  };

  const columns = [
    { header: 'Invoice', accessor: 'sale_number' },
    { header: 'Customer', accessor: 'customer_name' },
    { header: 'Phone', accessor: 'customer_phone' },
    {
      header: 'Sale date',
      accessor: 'created_at',
      render: (row) => formatDate(row.created_at),
    },
    {
      header: 'Total',
      accessor: 'total_amount',
      render: (row) => formatCurrency(row.total_amount),
    },
    {
      header: 'Balance due',
      accessor: 'balance_due',
      render: (row) => (
        <span className={isOverdue(row) ? 'font-semibold text-red-600' : 'font-semibold'}>
          {formatCurrency(row.balance_due)}
        </span>
      ),
    },
    {
      header: 'Due date',
      accessor: 'credit_due_date',
      render: (row) =>
        row.credit_due_date ? (
          <span className={isOverdue(row) ? 'text-red-600' : ''}>{row.credit_due_date}</span>
        ) : (
          '—'
        ),
    },
    {
      header: 'Type',
      accessor: 'sale_type',
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.sale_type === 'wholesale' ? 'bg-violet-100 text-violet-800' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {row.sale_type === 'wholesale' ? 'Wholesale' : 'Retail'}
        </span>
      ),
    },
    {
      header: 'Actions',
      accessor: 'actions',
      cellClassName: 'text-right',
      render: (row) => (
        <Button size="sm" variant="primary" onClick={() => openPayment(row)}>
          Record payment
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BookOpen className="h-7 w-7 text-primary-600" />
            Credit &amp; Receivables
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Track credit sales, follow up on payments, retail and wholesale accounts.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Overdue only
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-gray-600">Outstanding</p>
          <Currency amount={summary.totalOutstanding || 0} className="stat-value-currency text-xl font-bold" />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Open invoices</p>
          <p className="text-2xl font-bold text-gray-900">{summary.openCount || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            Overdue
          </p>
          <p className="text-2xl font-bold text-red-600">{summary.overdueCount || 0}</p>
          <p className="text-sm text-red-500">{formatCurrency(summary.overdueAmount || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Credit customers</p>
          <p className="text-2xl font-bold text-gray-900">{summary.creditCustomers || 0}</p>
        </Card>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <Table
          columns={columns}
          data={receivables}
          loading={loading}
          emptyMessage="No outstanding credit sales"
        />
      </div>

      <Modal
        isOpen={showPayModal}
        onClose={() => {
          setShowPayModal(false);
          setSelectedSale(null);
        }}
        title="Record credit payment"
        size="md"
      >
        {selectedSale && (
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm">
              <p>
                <span className="font-medium">Invoice:</span> {selectedSale.sale_number}
              </p>
              <p>
                <span className="font-medium">Customer:</span> {selectedSale.customer_name}
              </p>
              <p>
                <span className="font-medium">Balance due:</span>{' '}
                {formatCurrency(selectedSale.balance_due)}
              </p>
            </div>

            <Input
              label="Payment amount (UGX)"
              type="number"
              min={1}
              max={selectedSale.balance_due}
              value={payForm.amount}
              onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />

            <div>
              <label className="form-label">Payment method</label>
              <select
                className="form-input"
                value={payForm.payment_method}
                onChange={(e) => setPayForm((p) => ({ ...p, payment_method: e.target.value }))}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Reference (optional)"
              value={payForm.payment_reference}
              onChange={(e) => setPayForm((p) => ({ ...p, payment_reference: e.target.value }))}
            />

            <Input
              label="Notes (optional)"
              value={payForm.notes}
              onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
              multiline
              rows={2}
            />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowPayModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                <DollarSign className="mr-1 h-4 w-4" />
                Record payment
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default CreditReceivables;
