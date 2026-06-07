import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Search, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { salesAPI } from '../api/client';
import { formatCurrency, formatDateTime, getStoreToday, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';

const STATUS_FILTERS = [
  { id: 'completed', label: 'Completed (can return)' },
  { id: 'voided', label: 'Voided / returned' },
  { id: 'all', label: 'All' },
];

function statusBadge(status) {
  if (status === 'voided') {
    return <span className="badge badge-danger">Voided</span>;
  }
  if (status === 'refunded') {
    return <span className="badge badge-warning">Refunded</span>;
  }
  return <span className="badge badge-success">Completed</span>;
}

const Returns = () => {
  const { hasRole } = useAuthStore();
  const [filterDate, setFilterDate] = useState(() => getStoreToday());
  const [statusFilter, setStatusFilter] = useState('completed');
  const [searchReceipt, setSearchReceipt] = useState('');
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        from: filterDate,
        to: filterDate,
        status: statusFilter,
        limit: 150,
      };
      const { data } = await salesAPI.getAll(params);
      let rows = data.sales || [];
      const q = searchReceipt.trim().toLowerCase();
      if (q) {
        rows = rows.filter((s) => String(s.sale_number || '').toLowerCase().includes(q));
      }
      setSales(rows);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [filterDate, statusFilter, searchReceipt]);

  useEffect(() => {
    if (!hasRole('admin', 'manager')) return;
    fetchSales();
  }, [fetchSales, hasRole]);

  const openDetail = async (sale) => {
    setSelectedSale(sale);
    setDetailModalOpen(true);
    setSaleItems([]);
    try {
      const { data } = await salesAPI.getById(sale.id);
      setSelectedSale(data.sale || sale);
      setSaleItems(data.items || []);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const openVoid = (sale) => {
    setSelectedSale(sale);
    setVoidReason('');
    setVoidModalOpen(true);
  };

  const handleVoid = async () => {
    if (!selectedSale?.id) return;
    const reason = voidReason.trim();
    if (!reason) {
      toast.error('Enter why this sale is being returned or voided');
      return;
    }
    if (!window.confirm(`Void receipt ${selectedSale.sale_number}? Stock will be restored and totals updated.`)) {
      return;
    }
    setVoiding(true);
    try {
      await salesAPI.void(selectedSale.id, reason);
      toast.success(`Receipt ${selectedSale.sale_number} voided — stock restored`);
      setVoidModalOpen(false);
      setSelectedSale(null);
      setVoidReason('');
      fetchSales();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setVoiding(false);
    }
  };

  const renderActions = (row) => (
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="text-sm font-medium text-primary-600 hover:text-primary-800"
        onClick={() => openDetail(row)}
      >
        View
      </button>
      {row.status === 'completed' && (
        <button
          type="button"
          className="text-sm font-medium text-red-600 hover:text-red-800"
          onClick={() => openVoid(row)}
        >
          Void / return
        </button>
      )}
    </div>
  );

  const columns = [
    { header: 'Receipt #', accessor: 'sale_number', render: (row) => <span className="font-mono text-sm">{row.sale_number}</span> },
    {
      header: 'Date & time',
      accessor: 'created_at',
      render: (row) => formatDateTime(row.created_at),
    },
    { header: 'Cashier', accessor: 'cashier_name' },
    { header: 'Customer', accessor: 'customer_name', render: (row) => row.customer_name || 'Walk-in' },
    {
      header: 'Amount',
      accessor: 'total_amount',
      render: (row) => <span className="font-medium">{formatCurrency(row.total_amount)}</span>,
    },
    { header: 'Status', accessor: 'status', render: (row) => statusBadge(row.status) },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  if (!hasRole('admin', 'manager')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-600">Only admin or manager can process returns and void sales.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Returns & voids</h1>
        <p className="mt-1 text-sm text-gray-600">
          Cancel a completed sale (return policy). Stock goes back on the shelf, loyalty points are reversed, and
          daily reports no longer count the sale.
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50/80 p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Return policy (how void works)</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800">
              <li>Only <strong>admin</strong> or <strong>manager</strong> can void a receipt.</li>
              <li>Full receipt only — all items on that sale are returned to stock.</li>
              <li>Give cash or MoMo refund to the customer manually; the system reverses the recorded sale.</li>
              <li>Voided sales show in reports as excluded from revenue (status = voided).</li>
              <li>Return appears under <strong>Inventory → Adjustments</strong> as type <strong>return</strong>.</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Sale date</label>
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <select
            className="form-input min-w-[200px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Receipt #</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="form-input w-full pl-9"
              placeholder="Search INV-…"
              value={searchReceipt}
              onChange={(e) => setSearchReceipt(e.target.value)}
            />
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={fetchSales}>
          Refresh
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          data={sales}
          loading={loading}
          emptyMessage="No sales for this date and filter"
          onRowClick={openDetail}
        />
      </Card>

      <Modal isOpen={detailModalOpen} onClose={() => setDetailModalOpen(false)} title="Sale detail" size="lg">
        {selectedSale ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-gray-500">Receipt:</span>{' '}
                <span className="font-mono font-medium">{selectedSale.sale_number}</span>
              </p>
              <p>
                <span className="text-gray-500">Time:</span> {formatDateTime(selectedSale.created_at)}
              </p>
              <p>
                <span className="text-gray-500">Status:</span> {statusBadge(selectedSale.status)}
              </p>
              <p>
                <span className="text-gray-500">Total:</span>{' '}
                <span className="font-semibold">{formatCurrency(selectedSale.total_amount)}</span>
              </p>
              <p>
                <span className="text-gray-500">Cashier:</span> {selectedSale.cashier_name || '—'}
              </p>
              <p>
                <span className="text-gray-500">Customer:</span> {selectedSale.customer_name || 'Walk-in'}
              </p>
            </div>
            {selectedSale.notes ? (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{selectedSale.notes}</p>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-gray-500">
                        Loading items…
                      </td>
                    </tr>
                  ) : (
                    saleItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.product_name}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {selectedSale.status === 'completed' && (
              <Button type="button" variant="danger" onClick={() => { setDetailModalOpen(false); openVoid(selectedSale); }}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Void this sale
              </Button>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={voidModalOpen}
        onClose={() => !voiding && setVoidModalOpen(false)}
        title="Void sale / process return"
      >
        {selectedSale ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Void receipt <strong className="font-mono">{selectedSale.sale_number}</strong> (
              {formatCurrency(selectedSale.total_amount)})? Stock will be put back and the sale removed from daily
              totals.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Return reason <span className="text-red-500">*</span>
              </label>
              <textarea
                className="form-input min-h-[88px] w-full"
                placeholder="e.g. Customer returned goods, wrong item sold, damaged product returned…"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                disabled={voiding}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setVoidModalOpen(false)} disabled={voiding}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={handleVoid} disabled={voiding}>
                {voiding ? 'Voiding…' : 'Confirm void'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default Returns;
