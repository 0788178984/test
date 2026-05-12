import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { inventoryAPI, productsAPI } from '../api/client';
import { formatCurrency, formatDate } from '../api/client';
import Card from '../components/ui/Card';
import Table from '../components/ui/Table';
import Button from '../components/ui/Button';

const Inventory = () => {
  const { hasRole } = useAuthStore();
  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiringProducts, setExpiringProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Package },
    { id: 'low-stock', name: 'Low Stock', icon: AlertTriangle },
    { id: 'expiring', name: 'Expiring', icon: TrendingDown },
    { id: 'adjustments', name: 'Adjustments', icon: TrendingUp }
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
    fetchLowStock();
    fetchExpiring();
  }, []);

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

  const lowStockColumns = [
    { header: 'Product', accessor: 'name' },
    { header: 'Current Stock', accessor: 'current_stock', cellClassName: 'text-center' },
    { header: 'Min Stock', accessor: 'minimum_stock', cellClassName: 'text-center' },
    { header: 'Unit', accessor: 'unit' },
    { header: 'Category', accessor: 'category' },
    { header: 'Last Updated', accessor: 'updated_at', render: (row) => formatDate(row.updated_at) }
  ];

  const expiringColumns = [
    { header: 'Product', accessor: 'name' },
    { header: 'Expiry Date', accessor: 'expiry_date', render: (row) => formatDate(row.expiry_date) },
    { header: 'Current Stock', accessor: 'current_stock', cellClassName: 'text-center' },
    { header: 'Status', accessor: 'expiry_status', render: (row) => (
      <span className={`badge badge-${row.expiry_status === 'expired' ? 'danger' : row.expiry_status === 'critical' ? 'warning' : 'warning'}`}>
        {row.expiry_status?.charAt(0).toUpperCase() + row.expiry_status?.slice(1)}
      </span>
    )}
  ];

  const adjustmentsColumns = [
    { header: 'Product', accessor: 'product_name' },
    { header: 'Type', accessor: 'adjustment_type' },
    { header: 'Quantity Change', accessor: 'quantity_change', cellClassName: 'text-center', render: (row) => (
      <span className={row.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>
        {row.quantity_change > 0 ? '+' : ''}{row.quantity_change}
      </span>
    )},
    { header: 'Reason', accessor: 'reason' },
    { header: 'User', accessor: 'user_name' },
    { header: 'Date', accessor: 'created_at', render: (row) => formatDate(row.created_at) }
  ];

  if (!hasRole('admin', 'manager', 'cashier')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        <Button
          onClick={() => window.location.reload()}
          variant="secondary"
          size="sm"
        >
          Refresh
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm p-2">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="font-medium">{tab.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <div className="flex items-center space-x-3">
              <Package className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{lowStockItems.length}</p>
                <p className="text-sm text-gray-600">Low Stock Items</p>
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{expiringProducts.filter(p => p.expiry_status === 'expired').length}</p>
                <p className="text-sm text-gray-600">Expired Products</p>
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{expiringProducts.filter(p => p.expiry_status === 'warning' || p.expiry_status === 'critical').length}</p>
                <p className="text-sm text-gray-600">Expiring Soon</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'low-stock' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Low Stock Items</h2>
            <Button
              onClick={fetchLowStock}
              variant="secondary"
              size="sm"
            >
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Exiring Products</h2>
            <Button
              onClick={fetchExpiring}
              variant="secondary"
              size="sm"
            >
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Stock Adjustments</h2>
            <Button
              onClick={fetchAdjustments}
              variant="secondary"
              size="sm"
            >
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
