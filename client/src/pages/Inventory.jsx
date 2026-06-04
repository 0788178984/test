import React, { useState, useEffect } from 'react';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Boxes,
  Layers,
  DollarSign,
  PiggyBank,
  Receipt,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { inventoryAPI } from '../api/client';
import { formatCurrency, formatDate } from '../api/client';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Table from '../components/ui/Table';
import Button from '../components/ui/Button';

const Inventory = () => {
  const { hasRole } = useAuthStore();
  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiringProducts, setExpiringProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [productValuation, setProductValuation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Package },
    { id: 'low-stock', name: 'Low Stock', icon: AlertTriangle },
    { id: 'expiring', name: 'Expiring', icon: TrendingDown },
    { id: 'adjustments', name: 'Adjustments', icon: TrendingUp },
  ];

  useEffect(() => {
    if (activeTab === 'low-stock') {
      fetchLowStock();
    } else if (activeTab === 'expiring') {
      fetchExpiring();
    } else if (activeTab === 'adjustments') {
      fetchAdjustments();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const [summaryRes, lowRes, expRes] = await Promise.all([
        inventoryAPI.getSummary(),
        inventoryAPI.getLowStock(),
        inventoryAPI.getExpiring(),
      ]);
      setSummary(summaryRes.data.summary || null);
      setCategoryBreakdown(summaryRes.data.categoryBreakdown || []);
      setProductValuation(summaryRes.data.productValuation || []);
      setLowStockItems(lowRes.data.lowStockItems || []);
      setExpiringProducts(expRes.data.expiringProducts || []);
    } catch (error) {
      console.error('Fetch inventory overview error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLowStock = async () => {
    try {
      const response = await inventoryAPI.getLowStock();
      setLowStockItems(response.data.lowStockItems || []);
    } catch (error) {
      console.error('Fetch low stock error:', error);
    }
  };

  const fetchExpiring = async () => {
    try {
      const response = await inventoryAPI.getExpiring();
      setExpiringProducts(response.data.expiringProducts || []);
    } catch (error) {
      console.error('Fetch expiring error:', error);
    }
  };

  const fetchAdjustments = async () => {
    try {
      const response = await inventoryAPI.getAdjustments();
      setAdjustments(response.data.adjustments || []);
    } catch (error) {
      console.error('Fetch adjustments error:', error);
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'overview') fetchOverview();
    else if (activeTab === 'low-stock') fetchLowStock();
    else if (activeTab === 'expiring') fetchExpiring();
    else fetchAdjustments();
  };

  const lowStockColumns = [
    { header: 'Product', accessor: 'name' },
    { header: 'Current Stock', accessor: 'current_stock', cellClassName: 'text-center' },
    { header: 'Min Stock', accessor: 'minimum_stock', cellClassName: 'text-center' },
    { header: 'Unit', accessor: 'unit' },
    { header: 'Category', accessor: 'category' },
    { header: 'Last Updated', accessor: 'updated_at', render: (row) => formatDate(row.updated_at) },
  ];

  const expiringColumns = [
    { header: 'Product', accessor: 'name' },
    { header: 'Expiry Date', accessor: 'expiry_date', render: (row) => formatDate(row.expiry_date) },
    { header: 'Current Stock', accessor: 'current_stock', cellClassName: 'text-center' },
    {
      header: 'Status',
      accessor: 'expiry_status',
      render: (row) => (
        <span
          className={`badge badge-${
            row.expiry_status === 'expired' ? 'danger' : 'warning'
          }`}
        >
          {row.expiry_status?.charAt(0).toUpperCase() + row.expiry_status?.slice(1)}
        </span>
      ),
    },
  ];

  const categoryColumns = [
    { header: 'Category', accessor: 'category' },
    {
      header: 'Units on hand',
      accessor: 'total_units',
      cellClassName: 'text-right',
      render: (row) => Number(row.total_units).toLocaleString(),
    },
    {
      header: 'Stock spend (cost)',
      accessor: 'cost_value',
      cellClassName: 'text-right',
      render: (row) => formatCurrency(row.cost_value),
    },
    {
      header: 'If sold (listed price)',
      accessor: 'sell_value',
      cellClassName: 'text-right',
      render: (row) => formatCurrency(row.sell_value),
    },
    {
      header: 'Projected profit',
      accessor: 'profit_value',
      cellClassName: 'text-right',
      render: (row) => (
        <span className={row.profit_value > 0 ? 'text-green-700 font-medium' : 'text-gray-600'}>
          {formatCurrency(row.profit_value)}
        </span>
      ),
    },
  ];

  const valuationColumns = [
    { header: 'Product', accessor: 'name' },
    { header: 'Category', accessor: 'category' },
    {
      header: 'Qty',
      accessor: 'current_stock',
      cellClassName: 'text-center',
      render: (row) => `${Number(row.current_stock).toLocaleString()} ${row.unit || ''}`.trim(),
    },
    {
      header: 'Buy / unit',
      accessor: 'buying_price',
      cellClassName: 'text-right',
      render: (row) => formatCurrency(row.buying_price),
    },
    {
      header: 'Sell / unit',
      accessor: 'selling_price',
      cellClassName: 'text-right',
      render: (row) => formatCurrency(row.selling_price),
    },
    {
      header: 'Stock spend',
      accessor: 'cost_value',
      cellClassName: 'text-right',
      render: (row) => formatCurrency(row.cost_value),
    },
    {
      header: 'If all sold',
      accessor: 'sell_value',
      cellClassName: 'text-right',
      render: (row) => formatCurrency(row.sell_value),
    },
    {
      header: 'Profit if sold',
      accessor: 'profit_value',
      cellClassName: 'text-right',
      render: (row) => (
        <span className={row.profit_value > 0 ? 'text-green-700 font-medium' : 'text-gray-600'}>
          {formatCurrency(row.profit_value)}
        </span>
      ),
    },
  ];

  const adjustmentsColumns = [
    { header: 'Product', accessor: 'product_name' },
    { header: 'Type', accessor: 'adjustment_type' },
    {
      header: 'Quantity Change',
      accessor: 'quantity_change',
      cellClassName: 'text-center',
      render: (row) => (
        <span className={row.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>
          {row.quantity_change > 0 ? '+' : ''}
          {row.quantity_change}
        </span>
      ),
    },
    {
      header: 'Purchase cost',
      accessor: 'cost_per_unit',
      cellClassName: 'text-right',
      render: (row) => {
        if (!(row.quantity_change > 0)) return '—';
        const unit = Number(row.cost_per_unit);
        if (!Number.isFinite(unit) || unit <= 0) return '—';
        return formatCurrency(unit * row.quantity_change);
      },
    },
    { header: 'Reason', accessor: 'reason' },
    { header: 'User', accessor: 'user_name' },
    { header: 'Date', accessor: 'created_at', render: (row) => formatDate(row.created_at) },
  ];

  if (!hasRole('admin', 'manager', 'cashier')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-yellow-600" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600">You don&apos;t have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        <Button onClick={handleRefresh} variant="secondary" size="sm">
          Refresh
        </Button>
      </div>

      <div className="rounded-xl bg-white p-2 shadow-sm">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 rounded-lg px-4 py-2 transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-primary-50 hover:text-primary-800'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="font-medium">{tab.name}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="stat-grid">
            <StatCard
              featured
              icon={Boxes}
              iconWrapClassName="rounded-full bg-primary-100 p-3"
              iconClassName="h-8 w-8 text-primary-700"
              value={loading ? '—' : Number(summary?.total_units ?? 0).toLocaleString()}
              label="Total stock available"
              hint="Sum of quantities on hand (active products)"
            />
            <StatCard
              icon={Layers}
              iconWrapClassName="p-0 bg-transparent"
              iconClassName="h-8 w-8 text-indigo-600"
              value={loading ? '—' : Number(summary?.in_stock_products ?? 0).toLocaleString()}
              label="Products with stock"
              hint={`of ${Number(summary?.active_products ?? summary?.total_products ?? 0)} active`}
            />
            <StatCard
              icon={AlertTriangle}
              iconWrapClassName="p-0 bg-transparent"
              iconClassName="h-8 w-8 text-orange-600"
              value={loading ? '—' : Number(summary?.low_stock_count ?? lowStockItems.length)}
              label="Low stock items"
            />
            <StatCard
              icon={AlertTriangle}
              iconWrapClassName="p-0 bg-transparent"
              iconClassName="h-8 w-8 text-red-600"
              value={loading ? '—' : Number(summary?.expired_count ?? 0)}
              label="Expired (with stock)"
            />
            <StatCard
              icon={TrendingDown}
              iconWrapClassName="p-0 bg-transparent"
              iconClassName="h-8 w-8 text-amber-600"
              value={loading ? '—' : Number(summary?.expiring_soon_count ?? 0)}
              label="Expiring soon (30 days)"
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Stock valuation</h2>
            <p className="text-sm text-gray-600 mb-4">
              Expenditure is what you spent to buy stock on hand (quantity × buying price). Potential revenue uses your
              assigned selling prices. Profit is what you would realise if every unit on hand sold at those prices.
            </p>
            <div className="stat-grid sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Receipt}
                iconWrapClassName="p-0 bg-transparent"
                iconClassName="h-8 w-8 text-rose-600"
                currency
                value={loading ? '—' : formatCurrency(summary?.stock_expenditure ?? summary?.stock_value_at_cost ?? 0)}
                label="Total stock expenditure"
                hint="Money tied up in inventory (cost basis)"
              />
              <StatCard
                icon={DollarSign}
                iconWrapClassName="p-0 bg-transparent"
                iconClassName="h-8 w-8 text-blue-600"
                currency
                value={
                  loading ? '—' : formatCurrency(summary?.potential_sales_revenue ?? summary?.stock_value_at_selling ?? 0)
                }
                label="Potential sales revenue"
                hint="If all on-hand stock sells at listed prices"
              />
              <StatCard
                icon={PiggyBank}
                iconWrapClassName="p-0 bg-transparent"
                iconClassName="h-8 w-8 text-green-600"
                currency
                value={loading ? '—' : formatCurrency(summary?.projected_profit_if_sold ?? 0)}
                label="Projected profit if sold"
                hint={
                  loading
                    ? undefined
                    : `Margin ${Number(summary?.projected_margin_percent ?? 0).toLocaleString()}% on listed prices`
                }
              />
              <StatCard
                icon={TrendingUp}
                iconWrapClassName="p-0 bg-transparent"
                iconClassName="h-8 w-8 text-violet-600"
                currency
                value={loading ? '—' : formatCurrency(summary?.lifetime_purchase_expenditure ?? 0)}
                label="Recorded stock purchases"
                hint="Sum of restock & positive adjustments (with cost entered)"
              />
            </div>
          </div>

          {!loading && categoryBreakdown.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">By category</h2>
              <Table
                columns={categoryColumns}
                data={categoryBreakdown}
                loading={loading}
                emptyMessage="No categories with stock"
              />
            </Card>
          )}

          {!loading && productValuation.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Product detail</h2>
              <p className="text-sm text-gray-500 mb-4">
                Per-item spend, listed sale value, and profit if every unit on hand sells at the price you set.
              </p>
              <Table
                columns={valuationColumns}
                data={productValuation}
                loading={loading}
                emptyMessage="No products with stock"
              />
            </Card>
          )}

          {!loading && Number(summary?.total_units ?? 0) === 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <p className="text-sm text-amber-900">
                No stock on hand yet. Add products under <strong>Products</strong>, or restock via
                inventory adjustments — POS sales reduce stock automatically.
              </p>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'low-stock' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Low Stock Items</h2>
            <Button onClick={fetchLowStock} variant="secondary" size="sm">
              Refresh
            </Button>
          </div>
          <Table
            columns={lowStockColumns}
            data={lowStockItems}
            loading={loading}
            emptyMessage="No items with low stock"
          />
        </Card>
      )}

      {activeTab === 'expiring' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Expiring Products</h2>
            <Button onClick={fetchExpiring} variant="secondary" size="sm">
              Refresh
            </Button>
          </div>
          <Table
            columns={expiringColumns}
            data={expiringProducts}
            loading={loading}
            emptyMessage="No expiring products"
          />
        </Card>
      )}

      {activeTab === 'adjustments' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Stock Adjustments</h2>
            <Button onClick={fetchAdjustments} variant="secondary" size="sm">
              Refresh
            </Button>
          </div>
          <Table
            columns={adjustmentsColumns}
            data={adjustments}
            loading={loading}
            emptyMessage="No stock adjustments found"
          />
        </Card>
      )}
    </div>
  );
};

export default Inventory;
