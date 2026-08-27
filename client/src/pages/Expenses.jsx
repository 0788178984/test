import React, { useState, useEffect, useMemo } from 'react';
import { Wallet, Plus, Edit, Trash2, Package, Banknote } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { expensesAPI, productsAPI } from '../api/client';
import { formatCurrency, formatDate, getStoreToday, addStoreDays, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import { useAuthStore } from '../store/authStore';
import Currency from '../components/ui/Currency';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import Card from '../components/ui/Card';

const CATEGORY_LABELS = {
  rent: 'Rent',
  utilities: 'Utilities',
  salaries: 'Salaries & wages',
  transport: 'Transport',
  lunch: 'Lunch & meals',
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

const EXPENSE_TYPE_LABELS = {
  cash_out: 'Cash paid out',
  stock_usage: 'Stock used',
};

const defaultForm = () => ({
  expense_type: 'cash_out',
  title: '',
  category: 'other',
  amount: '',
  payment_method: 'cash',
  expense_date: getStoreToday(),
  notes: '',
  receipt_ref: '',
  product_id: '',
  product_name: '',
  quantity: '1',
});

const Expenses = () => {
  const { hasRole } = useAuthStore();
  const isCashierOnly = hasRole('cashier') && !hasRole('admin', 'manager');

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(defaultForm());
  const [filterDate, setFilterDate] = useState(() => getStoreToday());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [summary, setSummary] = useState({ count: 0, total: 0, cash_total: 0, stock_total: 0 });
  const [categories, setCategories] = useState([]);
  const [recordableCategories, setRecordableCategories] = useState([]);
  const [managerOnlyCategories, setManagerOnlyCategories] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  useEffect(() => {
    expensesAPI.getCategories().then((r) => {
      setCategories(r.data.categories || []);
      setRecordableCategories(r.data.recordable_categories || r.data.categories || []);
      setManagerOnlyCategories(r.data.manager_only_categories || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchSummary();
  }, [filterDate, filterCategory, filterType]);

  useEffect(() => {
    if (formData.expense_type !== 'stock_usage' || productSearch.trim().length < 2) {
      setProductResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const response = await productsAPI.getAll({ search: productSearch.trim(), limit: 8 });
        setProductResults(response.data.products || []);
      } catch {
        setProductResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearch, formData.expense_type]);

  const selectedProductCost = useMemo(() => {
    if (formData.expense_type !== 'stock_usage' || !formData.product_id) return null;
    const product = productResults.find((p) => p.id === formData.product_id);
    const qty = Number(formData.quantity) || 0;
    if (!product || qty <= 0) return null;
    return Math.round((Number(product.buying_price) || 0) * qty);
  }, [formData.expense_type, formData.product_id, formData.quantity, productResults]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = { date: filterDate, limit: 100 };
      if (filterCategory) params.category = filterCategory;
      if (filterType) params.expense_type = filterType;
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
      setSummary({
        count: response.data.count || 0,
        total: response.data.total || 0,
        cash_total: response.data.cash_total || 0,
        stock_total: response.data.stock_total || 0,
      });
    } catch {
      setSummary({ count: 0, total: 0, cash_total: 0, stock_total: 0 });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ ...defaultForm(), expense_date: filterDate });
    setProductSearch('');
    setProductResults([]);
    setShowModal(true);
  };

  const isManagerOnlyExpense = (row) => managerOnlyCategories.includes(row.category);

  const openEdit = (row) => {
    if (row.expense_type === 'stock_usage') {
      toast.error('Stock usage records cannot be edited. Remove and record again if needed.');
      return;
    }
    if (isCashierOnly && isManagerOnlyExpense(row)) {
      toast.error('Only admin or manager can edit this expense category.');
      return;
    }
    setEditing(row);
    setFormData({
      expense_type: row.expense_type || 'cash_out',
      title: row.title || '',
      category: row.category || 'other',
      amount: String(row.amount ?? ''),
      payment_method: row.payment_method || 'cash',
      expense_date: row.expense_date || filterDate,
      notes: row.notes || '',
      receipt_ref: row.receipt_ref || '',
      product_id: row.product_id || '',
      product_name: row.product_name || '',
      quantity: String(row.quantity ?? '1'),
    });
    setShowModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const selectProduct = (product) => {
    setFormData((prev) => ({
      ...prev,
      product_id: product.id,
      product_name: product.name,
      title: prev.title || `${prev.quantity || 1} × ${product.name}`,
    }));
    setProductSearch(product.name);
    setProductResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      expense_type: formData.expense_type,
      title: formData.title,
      category: formData.category,
      expense_date: formData.expense_date,
      notes: formData.notes,
      receipt_ref: formData.receipt_ref,
    };

    if (formData.expense_type === 'stock_usage') {
      payload.product_id = formData.product_id;
      payload.quantity = Number(formData.quantity);
      if (!payload.product_id) {
        toast.error('Select a product from stock.');
        return;
      }
      if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
        toast.error('Enter a valid quantity.');
        return;
      }
    } else {
      payload.amount = Number(formData.amount);
      payload.payment_method = formData.payment_method;
      if (!payload.title?.trim()) {
        toast.error('Enter a description for this expense.');
        return;
      }
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        toast.error('Enter a valid amount.');
        return;
      }
    }

    if (formData.expense_type !== 'stock_usage' && isCashierOnly && !recordableCategories.includes(formData.category)) {
      toast.error('This category is for admin or manager only (e.g. salaries, rent, tax).');
      return;
    }

    try {
      if (editing?.id) {
        await expensesAPI.update(editing.id, payload);
        toast.success('Expense updated');
      } else {
        await expensesAPI.create(payload);
        toast.success(formData.expense_type === 'stock_usage' ? 'Stock usage recorded' : 'Expense recorded');
      }
      setShowModal(false);
      setEditing(null);
      setFormData(defaultForm());
      setProductSearch('');
      fetchExpenses();
      fetchSummary();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const handleDelete = async (row) => {
    if (isCashierOnly && isManagerOnlyExpense(row)) {
      toast.error('Only admin or manager can remove this expense category.');
      return;
    }
    if (!window.confirm(`Remove "${row.title}"?${row.expense_type === 'stock_usage' ? ' Stock will be restored.' : ''}`)) return;
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

  const renderActions = (row) => {
    const lockedForCashier = isCashierOnly && isManagerOnlyExpense(row);
    return (
    <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
      {row.expense_type !== 'stock_usage' && !lockedForCashier && (
        <button type="button" onClick={() => openEdit(row)} className="p-1 rounded hover:bg-gray-100" title="Edit">
          <Edit className="w-4 h-4 text-blue-600" />
        </button>
      )}
      {!lockedForCashier && (
      <button type="button" onClick={() => handleDelete(row)} className="p-1 rounded hover:bg-red-50" title="Delete">
        <Trash2 className="w-4 h-4 text-red-600" />
      </button>
      )}
    </div>
    );
  };

  const renderType = (row) => {
    const type = row.expense_type || 'cash_out';
    const isStock = type === 'stock_usage';
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isStock ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-900'}`}>
        {isStock ? <Package className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
        {EXPENSE_TYPE_LABELS[type] || type}
      </span>
    );
  };

  const columns = [
    { header: 'Date', accessor: 'expense_date', render: (row) => formatDate(row.expense_date) },
    { header: 'Type', accessor: 'expense_type', render: renderType },
    { header: 'Title', accessor: 'title' },
    {
      header: 'Product',
      accessor: 'product_name',
      render: (row) => row.product_name ? `${row.product_name}${row.quantity ? ` (${row.quantity})` : ''}` : '—',
    },
    { header: 'Category', accessor: 'category', render: (row) => CATEGORY_LABELS[row.category] || row.category },
    { header: 'Amount', accessor: 'amount', render: (row) => <span className="font-medium text-red-600">{formatCurrency(row.amount)}</span> },
    {
      header: 'Till cash',
      accessor: 'payment_method',
      render: (row) => (row.expense_type === 'stock_usage' ? 'No change' : PAYMENT_LABELS[row.payment_method] || row.payment_method),
    },
    { header: 'Recorded by', accessor: 'recorded_by_name', render: (row) => row.recorded_by_name || '?' },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Expenses</h1>
          <p className="mt-1 text-sm text-gray-600">
            Record cash paid out (reduces till cash) or stock used from inventory (stock only).
          </p>
        </div>
        <Button onClick={openCreate} variant="primary">
          <Plus className="w-4 h-4 mr-2" />
          Record expense
        </Button>
      </div>

      <div className="stat-grid sm:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card min-w-0">
          <p className="stat-label">Cash paid out</p>
          <Currency amount={summary.cash_total} className="stat-value-currency text-red-600" amountClassName="text-red-600" />
          <p className="stat-hint mt-1">Reduces today&apos;s till cash</p>
        </Card>
        <Card className="stat-card min-w-0">
          <p className="stat-label">Stock used (at cost)</p>
          <Currency amount={summary.stock_total} className="stat-value-currency text-purple-700" amountClassName="text-purple-700" />
          <p className="stat-hint mt-1">Inventory reduced only</p>
        </Card>
        <Card className="stat-card min-w-0">
          <p className="stat-label">Total recorded</p>
          <Currency amount={summary.total} className="stat-value-currency text-gray-900" amountClassName="text-gray-900" />
          <p className="stat-hint mt-1">{summary.count} record{summary.count === 1 ? '' : 's'}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Selected date</p>
          <p className="text-lg font-semibold text-gray-900">{formatDate(filterDate)}</p>
        </Card>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div className="flex gap-2 pb-0.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => setFilterDate(getStoreToday())}>
              Today
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFilterDate(addStoreDays(getStoreToday(), -1))}
            >
              Yesterday
            </Button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select className="form-input w-full min-w-[180px]" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="cash_out">Cash paid out</option>
            <option value="stock_usage">Stock used</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select className="form-input w-full min-w-[180px]" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
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
          onRowClick={(row) => row.expense_type !== 'stock_usage' && !(isCashierOnly && isManagerOnlyExpense(row)) && openEdit(row)}
        />
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditing(null); setFormData(defaultForm()); setProductSearch(''); }}
        title={editing?.id ? 'Edit expense' : 'Record expense'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing?.id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">What happened?</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, expense_type: 'cash_out' }))}
                  className={`rounded-xl border-2 p-4 text-left transition ${formData.expense_type === 'cash_out' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <Banknote className="mb-2 h-5 w-5 text-amber-700" />
                  <p className="font-medium text-gray-900">Cash paid outside</p>
                  <p className="mt-1 text-xs text-gray-600">Transport, services, supplies bought with till cash. Reduces today&apos;s sale cash.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, expense_type: 'stock_usage' }))}
                  className={`rounded-xl border-2 p-4 text-left transition ${formData.expense_type === 'stock_usage' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <Package className="mb-2 h-5 w-5 text-purple-700" />
                  <p className="font-medium text-gray-900">Stock used from shop</p>
                  <p className="mt-1 text-xs text-gray-600">e.g. 2 sodas for staff. Stock goes down; till cash stays the same.</p>
                </button>
              </div>
            </div>
          )}

          {formData.expense_type === 'stock_usage' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search product</label>
                <Input
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    if (!e.target.value.trim()) {
                      setFormData((prev) => ({ ...prev, product_id: '', product_name: '' }));
                    }
                  }}
                  placeholder="Type product name or barcode"
                />
                {productSearchLoading && <p className="mt-1 text-xs text-gray-500">Searching…</p>}
                {productResults.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y">
                    {productResults.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => selectProduct(product)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <span>{product.name}</span>
                          <span className="text-xs text-gray-500">Stock: {product.current_stock}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {formData.product_name && (
                  <p className="mt-2 text-sm text-purple-800">Selected: <strong>{formData.product_name}</strong></p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Quantity used"
                  name="quantity"
                  type="number"
                  min="0.01"
                  step="any"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost value (auto)</label>
                  <p className="form-input bg-gray-50 text-gray-800">
                    {selectedProductCost != null ? formatCurrency(selectedProductCost) : 'Select product & quantity'}
                  </p>
                </div>
              </div>
              <Input label="Notes (optional)" name="notes" value={formData.notes} onChange={handleInputChange} multiline rows={2} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Title / description" name="title" value={formData.title} onChange={handleInputChange} required />
                <Input label="Amount (UGX)" name="amount" type="number" min="1" step="1" value={formData.amount} onChange={handleInputChange} required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select name="category" className="form-input w-full" value={formData.category} onChange={handleInputChange}>
                    {(recordableCategories.length ? recordableCategories : Object.keys(CATEGORY_LABELS)).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                    ))}
                  </select>
                  {isCashierOnly && (
                    <p className="mt-1 text-xs text-gray-500">
                      Salaries, rent, utilities, tax, and marketing are recorded by admin or manager only.
                    </p>
                  )}
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
            </>
          )}

          {formData.expense_type === 'stock_usage' && (
            <Input label="Expense date" name="expense_date" type="date" value={formData.expense_date} onChange={handleInputChange} required />
          )}

          <div className="flex justify-end space-x-4">
            <Button variant="secondary" type="button" onClick={() => { setShowModal(false); setEditing(null); setFormData(defaultForm()); setProductSearch(''); }}>Cancel</Button>
            <Button variant="primary" type="submit">{editing?.id ? 'Update' : 'Save expense'}</Button>
          </div>
        </form>
      </Modal>

      {isCashierOnly && (
        <p className="text-xs text-gray-500">
          Cash paid out reduces the till cash shown in end-of-day reports. Stock used only reduces inventory.
          High-level categories (salaries, rent, tax, etc.) require admin or manager.
        </p>
      )}
    </div>
  );
};

export default Expenses;
