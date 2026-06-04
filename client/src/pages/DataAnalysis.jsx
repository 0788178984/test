import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon, Calendar } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { reportsAPI, formatCurrency, formatDate, getStoreToday, addStoreDays } from '../api/client';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';

const PAYMENT_COLORS = ['#1D9E75', '#EAB308', '#3B82F6', '#8B5CF6', '#F97316'];

function formatPaymentLabel(method) {
  if (!method) return '—';
  return String(method).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const DataAnalysis = () => {
  const { hasRole, user } = useAuthStore();
  const [analysisDate, setAnalysisDate] = useState(() => getStoreToday());
  const [year, setYear] = useState(() => Number(getStoreToday().slice(0, 4)));
  const [month, setMonth] = useState(() => Number(getStoreToday().slice(5, 7)));
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [bestSellers, setBestSellers] = useState([]);

  const monthFrom = useMemo(() => {
    const m = String(month).padStart(2, '0');
    return `${year}-${m}-01`;
  }, [year, month]);

  const monthTo = useMemo(() => {
    const d = new Date(year, month, 0);
    const m = String(month).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${m}-${day}`;
  }, [year, month]);

  useEffect(() => {
    if (!hasRole('admin', 'manager')) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [dRes, mRes, bsRes] = await Promise.all([
          reportsAPI.getDaily({ date: analysisDate }),
          reportsAPI.getMonthly({ year, month }),
          reportsAPI.getBestSellers({ from: monthFrom, to: monthTo, limit: 10 }),
        ]);
        if (cancelled) return;
        setDaily(dRes.data || null);
        setMonthly(mRes.data || null);
        setBestSellers(bsRes.data?.bestSellers || []);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setDaily(null);
          setMonthly(null);
          setBestSellers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysisDate, year, month, monthFrom, monthTo]);

  if (!hasRole('admin', 'manager')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-600">You do not have access to data analysis.</p>
      </div>
    );
  }

  const hourlyData = (daily?.hourlySales || []).map((h) => ({
    hour: `${h.hour}:00`,
    revenue: Number(h.revenue) || 0,
    sales: Number(h.sales_count) || 0,
  }));

  const paymentPie = (daily?.paymentMethods || []).map((p) => ({
    name: formatPaymentLabel(p.payment_method),
    value: Number(p.amount) || 0,
    count: Number(p.count) || 0,
  }));

  const trendData = (monthly?.dailyBreakdown || []).map((row) => ({
    day: row.day ? formatDate(row.day, { month: 'short', day: 'numeric' }) : '',
    revenue: Number(row.revenue) || 0,
    profit: Number(row.profit) || 0,
  }));

  const topProducts = (bestSellers || []).slice(0, 8).map((p) => ({
    name: p.name?.length > 22 ? `${p.name.slice(0, 22)}…` : p.name,
    qty: Number(p.total_quantity) || 0,
    revenue: Number(p.total_revenue) || 0,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LineChartIcon className="h-8 w-8 text-primary-600" />
            Data analysis
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2 pb-1">
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setAnalysisDate(getStoreToday())}
            >
              Today
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setAnalysisDate(addStoreDays(getStoreToday(), -1))}
            >
              Yesterday
            </button>
          </div>
          <div className="w-44">
            <Input
              type="date"
              label="Day view"
              value={analysisDate}
              onChange={(e) => setAnalysisDate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Month trend
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                className="form-input w-24"
                min={2020}
                max={2035}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
              />
              <select
                className="form-input w-28"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString('default', { month: 'short' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-500">Loading analytics…</div>
      ) : (
        <>
          <div className="stat-grid">
            <Card className="stat-card min-w-0 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Selected day revenue</p>
              <p className="stat-value-currency mt-1 text-primary-700">
                {formatCurrency(daily?.summary?.revenue ?? 0)}
              </p>
              <p className="stat-hint mt-1">{daily?.summary?.sales_count ?? 0} completed sales</p>
            </Card>
            <Card className="stat-card min-w-0 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Month revenue</p>
              <p className="stat-value-currency mt-1 text-primary-700">
                {formatCurrency(monthly?.summary?.revenue ?? 0)}
              </p>
              <p className="stat-hint mt-1">{monthly?.summary?.sales_count ?? 0} sales this month</p>
            </Card>
            <Card className="stat-card min-w-0 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Month profit (est.)</p>
              <p className="stat-value-currency mt-1 text-emerald-700">
                {formatCurrency(monthly?.summary?.profit ?? 0)}
              </p>
              <p className="stat-hint mt-1">From completed sales in range</p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by hour — {analysisDate}</h2>
              <div className="h-72 w-full min-w-0">
                {hourlyData.length === 0 ? (
                  <p className="text-sm text-gray-500 py-8 text-center">No hourly sales for this day.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue (UGX)" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment mix — {analysisDate}</h2>
              <div className="h-72 w-full min-w-0 flex items-center justify-center">
                {paymentPie.length === 0 || paymentPie.every((p) => p.value === 0) ? (
                  <p className="text-sm text-gray-500">No payment data for this day.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {paymentPie.map((_, i) => (
                          <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Daily revenue trend — {year}-{String(month).padStart(2, '0')}
            </h2>
            <div className="h-80 w-full min-w-0">
              {trendData.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No sales in this month yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1D9E75" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="profit" name="Profit (est.)" stroke="#0D9488" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top products this month (by quantity)</h2>
            <div className="h-80 w-full min-w-0">
              {topProducts.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No product movement in this month.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v, key) =>
                        key === 'revenue' ? formatCurrency(v) : `${v} units`
                      }
                    />
                    <Legend />
                    <Bar dataKey="qty" name="Units sold" fill="#2563EB" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default DataAnalysis;
