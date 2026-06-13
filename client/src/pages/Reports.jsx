import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Calendar, TrendingUp, DollarSign, BarChart3, Users, Package } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { reportsAPI } from '../api/client';
import { formatCurrency, formatDate, getStoreToday, addStoreDays } from '../api/client';
import Currency from '../components/ui/Currency';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';

const Reports = () => {
  const { hasRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState('daily');
  const storeToday = getStoreToday();
  const [dateRange, setDateRange] = useState({
    from: storeToday,
    to: storeToday,
  });
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const tabs = [
    { id: 'daily', name: 'Daily Sales', icon: Calendar },
    { id: 'monthly', name: 'Monthly Sales', icon: TrendingUp },
    { id: 'annual', name: 'Annual', icon: BarChart3 },
    { id: 'profit', name: 'Profit & Loss', icon: DollarSign },
    { id: 'best-sellers', name: 'Best Sellers', icon: Package },
    { id: 'cashier', name: 'Cashier Performance', icon: Users }
  ];

  useEffect(() => {
    if (activeTab) {
      fetchReportData();
    }
  }, [activeTab, dateRange]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      let response;
      
      switch (activeTab) {
        case 'daily':
          response = await reportsAPI.getDaily({ date: dateRange.from });
          break;
        case 'monthly': {
          const d = new Date(dateRange.from);
          response = await reportsAPI.getMonthly({
            year: d.getFullYear(),
            month: d.getMonth() + 1,
          });
          break;
        }
        case 'annual':
          response = await reportsAPI.getAnnual({
            year: dateRange.from.slice(0, 4),
          });
          break;
        case 'profit':
          response = await reportsAPI.getProfit(dateRange);
          break;
        case 'best-sellers':
          response = await reportsAPI.getBestSellers(dateRange);
          break;
        case 'cashier':
          response = await reportsAPI.getCashier(dateRange);
          break;
        default:
          return;
      }
      
      const data = response.data || {};
      if (activeTab === 'profit' && data.totals) {
        const rev = Number(data.totals.total_revenue) || 0;
        const profit = Number(data.totals.total_profit) || 0;
        data.profitLoss = {
          totalRevenue: rev,
          totalCost: Number(data.totals.total_cost) || 0,
          grossProfit: profit,
          profitMargin: rev > 0 ? ((profit / rev) * 100).toFixed(1) : '0.0',
        };
      }
      setReports(data);
    } catch (error) {
      console.error('Fetch report error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getExportDateRange = () => {
    if (activeTab === 'monthly') {
      const d = new Date(`${dateRange.from}T12:00:00`);
      const y = d.getFullYear();
      const m = d.getMonth();
      const mm = String(m + 1).padStart(2, '0');
      const lastDay = new Date(y, m + 1, 0).getDate();
      return {
        from: `${y}-${mm}-01`,
        to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    if (activeTab === 'annual') {
      const year = dateRange.from.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    return { ...dateRange };
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewPdfUrl(null);
    setPreviewOpen(true);
    try {
      const exportRange = getExportDateRange();
      const response = await reportsAPI.getExportData(
        { ...exportRange, report_type: activeTab, format: 'pdf' },
        { responseType: 'blob' }
      );
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: 'application/pdf' });
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error('Preview error:', error);
      toast.error('Could not load PDF preview. Check the on-screen report or try download.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    setPreviewPdfUrl(null);
    setPreviewOpen(false);
  };

  const handleExport = async (format) => {
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const exportRange = getExportDateRange();
    try {
      const response = await reportsAPI.getExportData(
        {
          ...exportRange,
          report_type: activeTab,
          format,
        },
        { responseType: 'blob' }
      );

      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${activeTab}-report-${exportRange.from}_to_${exportRange.to}.${ext}`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Download started (${ext.toUpperCase()})`);
    } catch (error) {
      console.error('Export error:', error);
      const msg =
        error?.response?.data instanceof Blob
          ? 'Export failed'
          : error?.response?.data?.error || error.message || 'Export failed';
      if (error?.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const j = JSON.parse(text);
          toast.error(j.error || 'Export failed');
        } catch {
          toast.error('Export failed');
        }
      } else {
        toast.error(typeof msg === 'string' ? msg : 'Export failed');
      }
    }
  };

  const monthViewDate = dateRange.from ? new Date(`${dateRange.from}T12:00:00`) : null;
  const ry = Number(reports.year);
  const rm = Number(reports.month);
  const monthlyReportFresh =
    activeTab === 'monthly' &&
    monthViewDate != null &&
    Number.isFinite(ry) &&
    Number.isFinite(rm) &&
    ry === monthViewDate.getFullYear() &&
    rm === monthViewDate.getMonth() + 1;

  if (!hasRole('admin', 'manager')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'daily' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const d = getStoreToday();
                  setDateRange({ from: d, to: d });
                }}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const d = addStoreDays(getStoreToday(), -1);
                  setDateRange({ from: d, to: d });
                }}
              >
                Yesterday
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => {
                const v = e.target.value;
                setDateRange((prev) => ({
                  from: v,
                  to: activeTab === 'daily' ? v : prev.to,
                }));
              }}
              className="form-input"
            />
            {activeTab !== 'monthly' && activeTab !== 'annual' && activeTab !== 'daily' && (
              <>
                <span className="text-gray-500">to</span>
                <Input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                  className="form-input"
                />
              </>
            )}
          </div>
          <Button onClick={() => fetchReportData()} variant="secondary" size="sm">
            Generate Report
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <Card>
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
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
      </Card>

      {/* Report Content */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {tabs.find(t => t.id === activeTab)?.name}
          </h2>
          <div className="flex items-center space-x-2">
            <Button onClick={handlePreview} variant="secondary" size="sm" disabled={loading}>
              Preview PDF
            </Button>
            <Button
              onClick={() => handleExport('pdf')}
              variant="secondary"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={() => handleExport('xlsx')}
              variant="secondary"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Daily Sales Report */}
            {activeTab === 'daily' && (reports.dailySales || reports.summary) && (
              <div className="stat-grid gap-6">
                <div className="stat-panel text-center">
                  <p className="stat-value text-primary-600">
                    {reports.dailySales?.salesCount ?? reports.summary?.sales_count ?? 0}
                  </p>
                  <p className="stat-label mt-1">Total Sales</p>
                </div>
                <div className="stat-panel text-center">
                  <Currency
                    amount={reports.dailySales?.revenue ?? reports.summary?.revenue ?? 0}
                    className="stat-value-currency text-green-600"
                    amountClassName="text-green-600"
                  />
                  <p className="stat-label mt-1">Total Revenue</p>
                </div>
                <div className="stat-panel text-center">
                  <Currency
                    amount={reports.dailySales?.profit ?? reports.summary?.profit ?? 0}
                    className="stat-value-currency text-blue-600"
                    amountClassName="text-blue-600"
                  />
                  <p className="stat-label mt-1">Total Profit</p>
                </div>
                <div className="stat-panel text-center">
                  <Currency
                    amount={reports.dailySales?.averageSale ?? reports.summary?.average_sale ?? 0}
                    className="stat-value-currency text-orange-600"
                    amountClassName="text-orange-600"
                  />
                  <p className="stat-label mt-1">Average Sale</p>
                </div>
              </div>
            )}

            {activeTab === 'daily' && (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-gray-900">Sales detail — {dateRange.from}</h3>
                  <p className="text-xs text-gray-500">Seller, item sold, and line total for each receipt line</p>
                </div>
                {reports.saleLines?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table min-w-[640px]">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Receipt</th>
                          <th>Seller</th>
                          <th>Item</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.saleLines.map((row, index) => (
                          <tr key={`${row.sale_number}-${row.product_name}-${index}`}>
                            <td className="whitespace-nowrap text-gray-600">
                              {formatDate(row.created_at, { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="font-mono text-xs">{row.sale_number}</td>
                            <td>{row.cashier_name || '—'}</td>
                            <td className="max-w-[12rem] truncate" title={row.product_name}>
                              {row.product_name}
                            </td>
                            <td className="text-right tabular-nums">{Number(row.quantity)}</td>
                            <td className="text-right font-medium text-green-800">
                              {formatCurrency(row.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-4 py-10 text-center text-sm text-gray-500 sm:px-6">
                    No completed sales for this day.
                  </p>
                )}
              </Card>
            )}

            {/* Monthly Sales Report */}
            {monthlyReportFresh && (
              <div className="space-y-6">
                {reports.summary && (
                  <div className="stat-grid">
                    <div className="stat-panel bg-gradient-to-br from-primary-50 to-white">
                      <p className="text-xs font-medium uppercase tracking-wide text-primary-800">
                        Transactions
                      </p>
                      <p className="stat-value mt-2 text-primary-700">
                        {reports.summary.sales_count ?? 0}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">Completed sales (month)</p>
                    </div>
                    <div className="stat-panel bg-gradient-to-br from-green-50 to-white">
                      <p className="text-xs font-medium uppercase tracking-wide text-green-800">
                        Revenue
                      </p>
                      <Currency
                        amount={reports.summary.revenue ?? 0}
                        className="stat-value-currency mt-2 text-green-700"
                        amountClassName="text-green-700"
                      />
                      <p className="stat-hint mt-1">Total takings</p>
                    </div>
                    <div className="stat-panel bg-gradient-to-br from-blue-50 to-white">
                      <p className="text-xs font-medium uppercase tracking-wide text-blue-800">
                        Profit
                      </p>
                      <Currency
                        amount={reports.summary.profit ?? 0}
                        className="stat-value-currency mt-2 text-blue-700"
                        amountClassName="text-blue-700"
                      />
                      <p className="stat-hint mt-1">After cost of goods</p>
                    </div>
                    <div className="stat-panel bg-gradient-to-br from-amber-50 to-white">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-900">
                        Discounts
                      </p>
                      <Currency
                        amount={reports.summary.total_discount ?? 0}
                        className="stat-value-currency mt-2 text-gray-900"
                      />
                      <p className="stat-hint mt-1">Given at checkout</p>
                    </div>
                  </div>
                )}
                {reports.dailyBreakdown && reports.dailyBreakdown.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>Sales</th>
                          <th>Revenue</th>
                          <th>Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.dailyBreakdown.map((row, index) => (
                          <tr
                            key={index}
                            className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}
                          >
                            <td className="font-medium">{formatDate(row.day)}</td>
                            <td>{row.sales_count}</td>
                            <td className="text-green-800">{formatCurrency(row.revenue)}</td>
                            <td className="text-blue-800">{formatCurrency(row.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 px-6 py-14 text-center">
                    <BarChart3 className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-800">No daily breakdown yet</p>
                    <p className="mt-1 text-sm text-gray-600">No sales this month.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'annual' && reports.summary && (
              <div className="space-y-6">
                <div className="stat-grid">
                  <div className="stat-panel text-center">
                    <Currency
                      amount={reports.summary.revenue || 0}
                      className="stat-value-currency text-green-600"
                      amountClassName="text-green-600"
                    />
                    <p className="stat-label mt-1">Year revenue</p>
                  </div>
                  <div className="stat-panel text-center">
                    <Currency
                      amount={reports.summary.expenses_total || 0}
                      className="stat-value-currency text-red-600"
                      amountClassName="text-red-600"
                    />
                    <p className="stat-label mt-1">Year expenses</p>
                  </div>
                  <div className="stat-panel text-center">
                    <Currency
                      amount={reports.summary.net_cash ?? reports.summary.revenue}
                      className="stat-value-currency text-blue-600"
                      amountClassName="text-blue-600"
                    />
                    <p className="stat-label mt-1">Net (after expenses)</p>
                  </div>
                </div>
                {reports.monthlyBreakdown?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Sales</th>
                          <th>Revenue</th>
                          <th>Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.monthlyBreakdown.map((row) => (
                          <tr key={row.month}>
                            <td>{row.month}</td>
                            <td>{row.sales_count}</td>
                            <td>{formatCurrency(row.revenue)}</td>
                            <td>{formatCurrency(row.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Best Sellers Report */}
            {activeTab === 'best-sellers' && reports.bestSellers && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Total Quantity</th>
                      <th>Total Revenue</th>
                      <th>Profit Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.bestSellers.map((product, index) => (
                      <tr key={index}>
                        <td>{product.name}</td>
                        <td>{product.category}</td>
                        <td>{product.totalQuantity}</td>
                        <td>{formatCurrency(product.totalRevenue)}</td>
                        <td>{product.profitMargin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cashier Performance Report */}
            {activeTab === 'cashier' && reports.cashierPerformance && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cashier</th>
                      <th>Sales Count</th>
                      <th>Total Revenue</th>
                      <th>Average Sale</th>
                      <th>Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.cashierPerformance.map((cashier, index) => (
                      <tr key={index}>
                        <td>{cashier.name}</td>
                        <td>{cashier.salesCount}</td>
                        <td>{formatCurrency(cashier.totalRevenue)}</td>
                        <td>{formatCurrency(cashier.averageSale)}</td>
                        <td>
                          <span className={`badge badge-${
                            cashier.performance === 'excellent' ? 'success' :
                            cashier.performance === 'good' ? 'warning' : 'danger'
                          }`}>
                            {cashier.performance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Profit & Loss Report */}
            {activeTab === 'profit' && reports.profitLoss && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Revenue</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Sales:</span>
                      <span className="font-medium">{formatCurrency(reports.profitLoss.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost of Goods:</span>
                      <span className="font-medium">{formatCurrency(reports.profitLoss.totalCost)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Profit Analysis</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Gross Profit:</span>
                      <span className="font-medium text-green-600">{formatCurrency(reports.profitLoss.grossProfit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Profit Margin:</span>
                      <span className="font-medium">{reports.profitLoss.profitMargin}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal isOpen={previewOpen} onClose={closePreview} title="Report preview (PDF)" size="xl">
        {previewLoading ? (
          <div className="space-y-3 py-10">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <p className="text-center text-sm text-gray-600">Building PDF preview…</p>
          </div>
        ) : previewPdfUrl ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-inner">
            <iframe
              title="Report PDF preview"
              src={previewPdfUrl}
              className="h-[min(85vh,920px)] min-h-[420px] w-full bg-white"
            />
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-600">Preview unavailable — use Download PDF.</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closePreview}>
            Close
          </Button>
          <Button type="button" variant="primary" onClick={() => { handleExport('pdf'); closePreview(); }}>
            Download PDF
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default Reports;
