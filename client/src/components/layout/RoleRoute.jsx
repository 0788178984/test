import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/** Wrap routes that require one of the given roles (e.g. admin + manager). */
const RoleRoute = ({ allow }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !allow.includes(role)) {
    if (role === 'developer') {
      return <Navigate to="/developer" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};

export default RoleRoute;
