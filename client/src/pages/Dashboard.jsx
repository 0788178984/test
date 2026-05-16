import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
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

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuthStore();
  const [loading, setLoading] = useState(true);
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
      const productsResponse = await productsAPI.getAll({ limit: 1 });
      const lowStockResponse = await inventoryAPI.getLowStock();
      const customersResponse = await customersAPI.getAll({ limit: 1 });
      const recentSalesResponse = await salesAPI.getAll({ from: today, to: today, limit: 5 });

      let todayExpenses = 0;
      if (hasRole('admin', 'manager')) {
        try {
          const expRes = await expensesAPI.getTodaySummary();
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
      change: '+12%',
      changeType: 'increase'
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      icon: DollarSign,
      color: 'green',
      change: '+8%',
      changeType: 'increase'
    },
    ...(hasRole('admin', 'manager')
      ? [
          {
            title: "Today's Expenses",
            value: formatCurrency(stats.todayExpenses),
            icon: Wallet,
            color: 'red',
            change: '',
            changeType: 'decrease',
          },
        ]
      : []),
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'purple',
      change: '+2',
      changeType: 'increase'
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      color: 'orange',
      change: '-3',
      changeType: 'decrease'
    },
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      color: 'indigo',
      change: '+15',
      changeType: 'increase'
    }
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
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          Welcome back,{' '}
          <span className="font-medium text-gray-900">{user?.name || 'there'}</span>
          {". Here's what's happening today."}
        </p>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Dashboard</h1>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-full bg-${stat.color}-100`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className={`w-4 h-4 mr-1 ${
                stat.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
              }`} />
              <span className={`${
                stat.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.change} from last week
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Sales Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Sales</h2>
          <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            View All
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
              <div className="min-w-0">
                <p className="font-medium text-gray-900">Add New Product</p>
                <p className="text-sm text-gray-500">Manage inventory</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <Users className="w-6 h-6 shrink-0 text-primary-600" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900">Add Customer</p>
                <p className="text-sm text-gray-500">Customer management</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/expenses')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-400 hover:bg-red-50 transition-all text-left"
            >
              <Wallet className="w-6 h-6 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900">Record expense</p>
                <p className="text-sm text-gray-500">Money going out today</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <Eye className="w-6 h-6 shrink-0 text-primary-600" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900">View Reports</p>
                <p className="text-sm text-gray-500">Sales analytics</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all text-left"
            >
              <BarChart3 className="w-6 h-6 shrink-0 text-primary-600" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900">Inventory Check</p>
                <p className="text-sm text-gray-500">Stock status</p>
              </div>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
