import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Eye,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { salesAPI, productsAPI, inventoryAPI, customersAPI, expensesAPI } from '../api/client';
import { formatCurrency, formatDate } from '../api/client';
import Card from '../components/ui/Card';
import { storeReceiptBranding } from '../utils/storeBrand';

const STAT_ICON_STYLES = {
  blue: { wrap: 'bg-blue-100', icon: 'text-blue-600' },
  green: { wrap: 'bg-primary-100', icon: 'text-primary-600' },
  red: { wrap: 'bg-red-100', icon: 'text-red-600' },
  purple: { wrap: 'bg-purple-100', icon: 'text-purple-600' },
  orange: { wrap: 'bg-orange-100', icon: 'text-orange-600' },
  indigo: { wrap: 'bg-indigo-100', icon: 'text-indigo-600' },
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuthStore();
  const { name: storeName, code: storeCode } = storeReceiptBranding(user);
  const [loading, setLoading] = useState(true);
  const [storeDate, setStoreDate] = useState('');
  const [stats, setStats] = useState({
    todaySales: 0,
    todayRevenue: 0,
    todayExpenses: 0,
    totalProducts: 0,
    lowStockItems: 0,
    totalCustomers: 0,
    recentSales: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch today's sales summary
      const salesResponse = await salesAPI.getTodaySummary();
      const today = salesResponse.data.date;
      setStoreDate(today);
      const productsResponse = await productsAPI.getAll({ limit: 1 });
      const lowStockResponse = await inventoryAPI.getLowStock();
      const customersResponse = await customersAPI.getAll({ limit: 1 });
      const recentSalesResponse = await salesAPI.getAll({
        from: today,
        to: today,
        status: 'completed',
        limit: 5,
      });

      let todayExpenses = 0;
      if (hasRole('admin', 'manager', 'cashier')) {
        try {
          const expRes = await expensesAPI.getTodaySummary({ date: today });
          todayExpenses = expRes.data.total || 0;
        } catch {
          todayExpenses = 0;
        }
      }

      setStats({
        todaySales: salesResponse.data.sales_count || 0,
        todayRevenue: salesResponse.data.revenue || 0,
        todayExpenses,
        totalProducts: productsResponse.data.pagination?.total || 0,
        lowStockItems: lowStockResponse.data.lowStockItems?.length || 0,
        totalCustomers: customersResponse.data.pagination?.total || 0,
        recentSales: recentSalesResponse.data.sales || []
      });
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Today's Sales",
      value: stats.todaySales,
      icon: ShoppingCart,
      color: 'blue',
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      icon: DollarSign,
      color: 'green',
    },
    ...(hasRole('admin', 'manager', 'cashier')
      ? [
          {
            title: "Today's Expenses",
            value: formatCurrency(stats.todayExpenses),
            icon: Wallet,
            color: 'red',
          },
        ]
      : []),
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'purple',
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      color: 'orange',
    },
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      color: 'indigo',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting above title so long names never collide with the heading */}
      <header className="space-y-2 border-b border-gray-100 pb-4 sm:space-y-3">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Dashboard</h1>
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{user?.name || 'there'}</span>
          {storeCode && (
            <>
              {' · '}
              {storeName}
              {' · '}
              <span className="font-mono text-gray-700">{storeCode}</span>
            </>
          )}
        </p>
      </header>

      {/* Stats Grid */}
      <div className="stat-grid gap-6">
        {statCards.map((stat) => {
          const iconStyle = STAT_ICON_STYLES[stat.color] || STAT_ICON_STYLES.blue;
          return (
            <Card
              key={stat.title}
              className="stat-card min-w-0 transition-shadow duration-200 hover:shadow-lg hover:ring-1 hover:ring-primary-100"
            >
              <div className="stat-card__inner items-center justify-between">
                <div className="stat-card__content">
                  <p className="stat-label">{stat.title}</p>
                  <p
                    className={
                      stat.title.includes('Revenue') || stat.title.includes('Expenses')
                        ? 'stat-value-currency'
                        : 'stat-value'
                    }
                  >
                    {stat.value}
                  </p>
                </div>
                <div className={`stat-card__icon rounded-full p-3 ${iconStyle.wrap}`}>
                  <stat.icon className={`h-6 w-6 ${iconStyle.icon}`} aria-hidden />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Recent Sales Table */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Sales</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            View in Reports
          </button>
        </div>
        
        {stats.recentSales.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No sales today yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Customer</th>
                  <th>Cashier</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.sale_number}</td>
                    <td>{sale.customer_name || 'Guest'}</td>
                    <td>{sale.cashier_name}</td>
                    <td className="font-medium">{formatCurrency(sale.total_amount)}</td>
                    <td>
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {sale.payment_method.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>{formatDate(sale.created_at, { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {hasRole('cashier') && !hasRole('admin', 'manager') && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <button
            type="button"
            onClick={() => navigate('/expenses')}
            className="flex w-full max-w-md items-center space-x-3 rounded-lg border-2 border-dashed border-gray-300 p-4 text-left transition-all hover:border-red-400 hover:bg-red-50"
          >
            <Wallet className="h-6 w-6 shrink-0 text-red-600" />
            <p className="font-medium text-gray-900">Record expense</p>
          </button>
        </Card>
      )}

      {/* Quick Actions */}
      {hasRole('admin', 'manager') && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <Package className="w-6 h-6 shrink-0 text-primary-600" />
              <p className="font-medium text-gray-900">Add New Product</p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <Users className="w-6 h-6 shrink-0 text-primary-600" />
              <p className="font-medium text-gray-900">Add Customer</p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/expenses')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-400 hover:bg-red-50 transition-all text-left"
            >
              <Wallet className="w-6 h-6 shrink-0 text-red-600" />
              <p className="font-medium text-gray-900">Record expense</p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <Eye className="w-6 h-6 shrink-0 text-primary-600" />
              <p className="font-medium text-gray-900">View Reports</p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <BarChart3 className="w-6 h-6 shrink-0 text-primary-600" />
              <p className="font-medium text-gray-900">Inventory Check</p>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
