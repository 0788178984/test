import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/** Pathless layout route: must be used as <Route element={<ProtectedRoute />}>, not wrapping <Route> children. */
const ProtectedRoute = () => {
  const { isAuthenticated, checkAuth } = useAuthStore();

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
