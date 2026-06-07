import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleRoute from './components/layout/RoleRoute';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import DataAnalysis from './pages/DataAnalysis';
import Users from './pages/Users';
import Settings from './pages/Settings';
import DeveloperConsole from './pages/DeveloperConsole';
import NotificationsPage from './pages/NotificationsPage';
import TeamMessages from './pages/TeamMessages';
import Subscription from './pages/Subscription';
import MobileMoney from './pages/MobileMoney';
import Returns from './pages/Returns';

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="developer" element={<RoleRoute allow={['developer']} />}>
              <Route index element={<DeveloperConsole />} />
            </Route>

            <Route element={<RoleRoute allow={['admin', 'manager', 'cashier']} />}>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="pos" element={<POS />} />
                <Route path="mobile-money" element={<MobileMoney />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="customers" element={<Customers />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="subscription" element={<Subscription />} />

                <Route element={<RoleRoute allow={['admin', 'manager']} />}>
                  <Route path="products" element={<Products />} />
                  <Route path="suppliers" element={<Suppliers />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="returns" element={<Returns />} />
                  <Route path="data-analysis" element={<DataAnalysis />} />
                  <Route path="team-messages" element={<TeamMessages />} />
                </Route>

                <Route element={<RoleRoute allow={['admin']} />}>
                  <Route path="users" element={<Users />} />
                  <Route path="settings" element={<Settings />} />
                </Route>

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

export default App;
