import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { expensesAPI } from '../api/client';
import { formatCurrency, formatDate, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import Card from '../components/ui/Card';

const CATEGORY_LABELS = {
  rent: 'Rent',
  utilities: 'Utilities',
  salaries: 'Salaries & wages',
  transport: 'Transport',
  supplies: 'Supplies & stock',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  tax: 'Tax & fees',
  other: 'Other',
};

const PAYMENT_LABELS = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank: 'Bank transfer',
  other: 'Other',
};

const defaultForm = () => ({
  title: '',
  category: 'other',
  amount: '',
  payment_method: 'cash',
  expense_date: new Date().toISOString().split('T')[0],
  notes: '',
  receipt_ref: '',
});

const Expenses = () => {
  const { hasRole } = useAuthStore();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(defaultForm());
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterCategory, setFilterCategory] = useState('');
  const [summary, setSummary] = useState({ count: 0, total: 0 });
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    expensesAPI.getCategories().then((r) => setCategories(r.data.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchSummary();
  }, [filterDate, filterCategory]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = { date: filterDate, limit: 100 };
      if (filterCategory) params.category = filterCategory;
      const response = await expensesAPI.getAll(params);
      setExpenses(response.data.expenses || []);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await expensesAPI.getSummary({ from: filterDate, to: filterDate });
      setSummary({ count: response.data.count || 0, total: response.data.total || 0 });
    } catch {
      setSummary({ count: 0, total: 0 });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...defaultForm(), expense_date: filterDate });
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setFormData({
      title: row.title || '',
      category: row.category || 'other',
      amount: String(row.amount ?? ''),
      payment_method: row.payment_method || 'cash',
      expense_date: row.expense_date || filterDate,
      notes: row.notes || '',
      receipt_ref: row.receipt_ref || '',
    });
    setShowModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...formData, amount: Number(formData.amount) };
    try {
      if (editing?.id) {
        await expensesAPI.update(editing.id, payload);
        toast.success('Expense updated');
      } else {
        await expensesAPI.create(payload);
        toast.success('Expense recorded');
      }
      setShowModal(false);
      setEditing(null);
      setFormData(defaultForm());
      fetchExpenses();
      fetchSummary();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm('Remove expense "' + row.title + '"?')) return;
    try {
      await expensesAPI.delete(row.id);
      toast.success('Expense removed');
      fetchExpenses();
      fetchSummary();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const renderActions = (row) => (
    <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => openEdit(row)} className="p-1 rounded hover:bg-gray-100" title="Edit">
        <Edit className="w-4 h-4 text-blue-600" />
      </button>
      <button type="button" onClick={() => handleDelete(row)} className="p-1 rounded hover:bg-red-50" title="Delete">
        <Trash2 className="w-4 h-4 text-red-600" />
      </button>
    </div>
  );

  const columns = [
    { header: 'Date', accessor: 'expense_date', render: (row) => formatDate(row.expense_date) },
    { header: 'Title', accessor: 'title' },
    { header: 'Category', accessor: 'category', render: (row) => CATEGORY_LABELS[row.category] || row.category },
    { header: 'Amount', accessor: 'amount', render: (row) => <span className="font-medium text-red-600">{formatCurrency(row.amount)}</span> },
    { header: 'Payment', accessor: 'payment_method', render: (row) => PAYMENT_LABELS[row.payment_method] || row.payment_method },
    { header: 'Recorded by', accessor: 'recorded_by_name', render: (row) => row.recorded_by_name || '?' },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  if (!hasRole('admin', 'manager')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600">Only admin and manager can record expenses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Expenses</h1>
          <p className="text-sm text-gray-600">Record money going out ? rent, utilities, transport, and more.</p>
        </div>
        <Button onClick={openCreate} variant="primary">
          <Plus className="w-4 h-4 mr-2" />
          Record expense
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <p className="text-sm text-gray-600">Total for selected day</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.total)}</p>
          <p className="text-xs text-gray-500 mt-1">{summary.count} expense{summary.count === 1 ? '' : 's'}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Selected date</p>
          <p className="text-lg font-semibold text-gray-900">{formatDate(filterDate)}</p>
        </Card>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className="form-input w-full min-w-[180px]"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <Table
          columns={columns}
          data={expenses}
          loading={loading}
          emptyMessage="No expenses for this day"
          onRowClick={openEdit}
        />
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditing(null); setFormData(defaultForm()); }}
        title={editing?.id ? 'Edit expense' : 'Record expense'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Title / description" name="title" value={formData.title} onChange={handleInputChange} required />
            <Input label="Amount (UGX)" name="amount" type="number" min="1" step="1" value={formData.amount} onChange={handleInputChange} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select name="category" className="form-input w-full" value={formData.category} onChange={handleInputChange}>
                {(categories.length ? categories : Object.keys(CATEGORY_LABELS)).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                ))}
              </select>
            </div>
                        <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
              <select name="payment_method" className="form-input w-full" value={formData.payment_method} onChange={handleInputChange}>
                {Object.keys(PAYMENT_LABELS).map((m) => (
                  <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Expense date" name="expense_date" type="date" value={formData.expense_date} onChange={handleInputChange} required />
            <Input label="Receipt / reference #" name="receipt_ref" value={formData.receipt_ref} onChange={handleInputChange} />
          </div>
          <Input label="Notes" name="notes" value={formData.notes} onChange={handleInputChange} multiline rows={3} />
          <div className="flex justify-end space-x-4">
            <Button variant="secondary" type="button" onClick={() => { setShowModal(false); setEditing(null); setFormData(defaultForm()); }}>Cancel</Button>
            <Button variant="primary" type="submit">{editing?.id ? 'Update' : 'Save expense'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Expenses;
