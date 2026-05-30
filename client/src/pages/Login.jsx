import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const Login = () => {
  const [loginType, setLoginType] = useState('pin'); // 'pin' or 'web'
  const [businessCode, setBusinessCode] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('cashier');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const loginWeb = useAuthStore((state) => state.loginWeb);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const readStoreCodeFromForm = (form) => {
    const el = form?.elements?.namedItem?.('business_code');
    const fromDom = el && 'value' in el ? String(el.value).trim() : '';
    const fromState = String(businessCode ?? '').trim();
    return (fromDom || fromState).toUpperCase();
  };

  const handlePinLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const storeCode = readStoreCodeFromForm(e.currentTarget);
    const result = await login(pin, role, storeCode);

    if (result.success) {
      const u = useAuthStore.getState().user;
      toast.success(
        u?.business_name
          ? `Signed in to ${u.business_name} (${u.business_code || storeCode})`
          : 'Login successful!'
      );
      navigate(u?.role === 'developer' ? '/developer' : '/dashboard');
    } else {
      toast.error(result.error || 'Login failed');
    }
    
    setIsLoading(false);
  };

  const handleWebLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const webForm = e.currentTarget;
    const bcEl = webForm?.elements?.namedItem?.('business_code');
    const bcFromDom = bcEl && 'value' in bcEl ? String(bcEl.value).trim().toUpperCase() : '';
    const bc = bcFromDom || (businessCode.trim() ? businessCode.trim().toUpperCase() : '');
    const result = await loginWeb(email, password, loginType === 'web' && bc ? bc : undefined);

    if (result.success) {
      const u = useAuthStore.getState().user;
      toast.success(
        u?.business_name
          ? `Signed in to ${u.business_name} (${u.business_code || ''})`
          : 'Login successful!'
      );
      navigate(u?.role === 'developer' ? '/developer' : '/dashboard');
    } else {
      toast.error(result.error || 'Login failed');
    }
    
    setIsLoading(false);
  };

  return (
    <div key="login-page" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-uganda-yellow py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary-600 rounded-xl flex items-center justify-center">
            <Store className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            SuperMkt
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Uganda Store Management System
          </p>
        </div>

        {isAuthenticated && sessionUser && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 text-left">
            <p className="font-medium">You are already signed in</p>
            <p className="mt-1 text-amber-900">
              {sessionUser.name} · store <strong>{sessionUser.business_code || '—'}</strong>
              {sessionUser.business_name ? ` (${sessionUser.business_name})` : ''}
            </p>
            <p className="mt-2 text-xs text-amber-800">
              To open a different store (supermarket or clinic), sign out first — otherwise the app keeps your current session.
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-primary-700 underline"
              onClick={async () => {
                await logout();
                toast.success('Signed out. Choose store code and sign in again.');
              }}
            >
              Sign out
            </button>
          </div>
        )}

        {/* Login Type Toggle */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => setLoginType('pin')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              loginType === 'pin'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Lock className="w-4 h-4 mr-2" />
            PIN Login
          </button>
          <button
            onClick={() => setLoginType('web')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              loginType === 'web'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <User className="w-4 h-4 mr-2" />
            Web Login
          </button>
        </div>

        {/* Login Forms */}
        {loginType === 'pin' ? (
          <form onSubmit={handlePinLogin} className="mt-8 space-y-6">
            <Input
              name="business_code"
              autoComplete="off"
              label="Store code"
              placeholder="Store code from your administrator"
              value={businessCode}
              onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
              required
            />
            {/* Role Selection */}
            <div>
              <label className="form-label">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="form-input"
                required
              >
                <option value="">Select your role</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
              </select>
            </div>

            {/* PIN Input */}
            <Input
              type="password"
              label="4-Digit PIN"
              placeholder="Enter your PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              pattern="[0-9]*"
              required
            />

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              disabled={pin.length !== 4 || !role}
              className="w-full"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleWebLogin} className="mt-8 space-y-6">
            <Input
              name="business_code"
              autoComplete="off"
              label="Store code (if your email is used at more than one store)"
              placeholder="Only if your email is used at more than one store"
              value={businessCode}
              onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
            />
            {/* Email Input */}
            <Input
              type="email"
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* Password Input */}
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              disabled={!email || !password}
              className="w-full"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        )}

        <div className="mt-8 rounded-lg border border-gray-200 bg-white/80 px-4 py-3 text-center text-sm text-gray-600">
          <p>
            Use the <strong>store code</strong>, <strong>PIN</strong>, or <strong>email and password</strong> your store
            administrator gave you.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Platform developer accounts are issued separately and are not shown on this page.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
