import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../api/client';

function formatAuthError(error, fallback) {
  if (!error?.response) {
    if (error?.code === 'ECONNABORTED') {
      return 'Request timed out. The server may be waking up (Render free tier) — wait 30s and try again.';
    }
    return 'Cannot reach the server. Check your connection or open the deployed app URL (not localhost unless you ran npm run dev).';
  }
  const data = error.response?.data;
  const raw = data?.error ?? data?.detail ?? error.message ?? fallback;
  return typeof raw === 'string' ? raw : fallback;
}

const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (pin, role, business_code) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authAPI.login(pin, role, business_code);
          const { token, user } = response.data;
          
          localStorage.setItem('auth_token', token);
          localStorage.setItem('user', JSON.stringify(user));
          
          set({ 
            token, 
            user, 
            isAuthenticated: true, 
            isLoading: false, 
            error: null 
          });
          
          return { success: true };
        } catch (error) {
          const errorMessage = formatAuthError(error, 'Login failed');
          set({ 
            isLoading: false, 
            error: errorMessage 
          });
          return { success: false, error: errorMessage };
        }
      },

      loginWeb: async (email, password, business_code) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authAPI.loginWeb(email, password, business_code);
          const { token, user } = response.data;
          
          localStorage.setItem('auth_token', token);
          localStorage.setItem('user', JSON.stringify(user));
          
          set({ 
            token, 
            user, 
            isAuthenticated: true, 
            isLoading: false, 
            error: null 
          });
          
          return { success: true };
        } catch (error) {
          const errorMessage = formatAuthError(error, 'Login failed');
          set({ 
            isLoading: false, 
            error: errorMessage 
          });
          return { success: false, error: errorMessage };
        }
      },

      logout: async () => {
        try {
          await authAPI.logout();
        } catch (error) {
          console.error('Logout error:', error);
        }

        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        try {
          localStorage.removeItem('auth-storage');
        } catch (_) {
          /* ignore */
        }

        set({
          token: null,
          user: null,
          isAuthenticated: false,
          error: null,
        });
      },

      checkAuth: () => {
        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('user');
        
        if (token && userStr) {
          try {
            const user = JSON.parse(userStr);
            set({ 
              token, 
              user, 
              isAuthenticated: true 
            });
          } catch (error) {
            console.error('Error parsing user data:', error);
            // Clear invalid data
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
          }
        }
      },

      /** Refresh user from server (subscription, business name, etc.). No-op if not authenticated. */
      refreshProfile: async () => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        try {
          const { data } = await authAPI.me();
          if (data?.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            set({ user: data.user });
          }
        } catch (_) {
          /* ignore — banner may be stale until next navigation */
        }
      },

      changePin: async (currentPin, newPin) => {
        set({ isLoading: true, error: null });
        
        try {
          await authAPI.changePin(currentPin, newPin);
          set({ isLoading: false, error: null });
          return { success: true };
        } catch (error) {
          const errorMessage = error.response?.data?.error || error.message || 'Failed to change PIN';
          set({ 
            isLoading: false, 
            error: errorMessage 
          });
          return { success: false, error: errorMessage };
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        
        try {
          await authAPI.changePassword(currentPassword, newPassword);
          set({ isLoading: false, error: null });
          return { success: true };
        } catch (error) {
          const errorMessage = error.response?.data?.error || error.message || 'Failed to change password';
          set({ 
            isLoading: false, 
            error: errorMessage 
          });
          return { success: false, error: errorMessage };
        }
      },

      updateUser: (userData) => {
        const currentUser = get().user;
        const updatedUser = { ...currentUser, ...userData };
        
        localStorage.setItem('user', JSON.stringify(updatedUser));
        set({ user: updatedUser });
      },

      clearError: () => {
        set({ error: null });
      },

      // Getters — pass one role or many: hasRole('admin') or hasRole('admin', 'manager')
      hasRole: (...roles) => {
        const user = get().user;
        if (!user || roles.length === 0) return false;
        return roles.includes(user.role);
      },

      isAdmin: () => {
        return get().hasRole('admin');
      },

      isManager: () => {
        return get().hasRole('manager');
      },

      isCashier: () => {
        return get().hasRole('cashier');
      },

      canAccessFeature: (feature) => {
        const user = get().user;
        if (!user) return false;
        
        const permissions = {
          admin: ['*'], // Admin can access everything
          manager: [
            'view_sales', 'make_sale', 'apply_discount', 'void_sale',
            'view_reports', 'export_reports', 'view_products', 'add_edit_products',
            'adjust_stock', 'view_customers', 'manage_customers', 'view_suppliers',
            'manage_suppliers', 'view_notifications', 'view_inventory',
            'view_expenses', 'manage_expenses',
            'view_agent_float', 'manage_agent_float', 'record_agent_float',
          ],
          cashier: [
            'make_sale', 'apply_small_discount', 'view_own_sales',
            'view_products', 'view_notifications', 'view_inventory',
            'manage_customers', 'view_expenses', 'manage_expenses',
            'view_agent_float', 'record_agent_float',
          ]
        };
        
        const userPermissions = permissions[user.role] || [];
        return userPermissions.includes('*') || userPermissions.includes(feature);
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

export { useAuthStore };
