import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Calendar, TrendingUp, TrendingDown, DollarSign, BarChart3, Users, Package, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { reportsAPI } from '../api/client';
import { formatCurrency, formatDate, getStoreToday, addStoreDays } from '../api/client';
import Currency from '../components/ui/Currency';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';

const EXPENSE_TYPE_LABELS = {
  cash_out: 'Cash paid out',
  stock_usage: 'Stock used from shop',
};

const EXPENSE_CATEGORY_LABELS = {
  rent: 'Rent',
  utilities: 'Utilities',
  salaries: 'Salaries & wages',
  transport: 'Transport',
  lunch: 'Lunch & meals',
  supplies: 'Supplies & stock',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  tax: 'Tax & fees',
  other: 'Other',
};

const EM_DASH = '\u2014';

function getProfitLossStyle(amount) {
  const n = Number(amount) || 0;
  if (n < 0) {
    return {
      isLoss: true,
      amountClass: 'text-red-700',
      panelGradient: 'from-red-50 to-white',
      labelClass: 'text-red-800',
      borderClass: 'border-red-200',
    };
  }
  if (n > 0) {
    return {
      isLoss: false,
      amountClass: 'text-green-700',
      panelGradient: 'from-green-50 to-white',
      labelClass: 'text-green-800',
      borderClass: 'border-green-200',
    };
  }
  return {
    isLoss: false,
    amountClass: 'text-gray-700',
    panelGradient: 'from-gray-50 to-white',
    labelClass: 'text-gray-800',
    borderClass: 'border-gray-200',
  };
}

function profitLossCellClass(amount) {
  const n = Number(amount) || 0;
  if (n < 0) return 'font-semibold text-red-700';
  if (n > 0) return 'font-medium text-green-800';
  return 'text-gray-600';
}

function formatProfitLossTable(amount) {
  const n = Number(amount) || 0;
  const text = formatCurrency(n);
  if (n < 0) return `${text} (loss)`;
  if (n > 0) return `${text} (profit)`;
  return text;
}

function LossBadge() {
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">
      Loss
    </span>
  );
}

function ProfitBadge() {
  return (
    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-800">
      Profit
    </span>
  );
}

function ProfitLossCurrency({ amount, className = '', amountClassName = '' }) {
  const pl = getProfitLossStyle(amount);
  const n = Number(amount) || 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Currency
        amount={amount}
        className={className}
        amountClassName={`${pl.amountClass} ${amountClassName}`.trim()}
      />
      {pl.isLoss && <LossBadge />}
      {!pl.isLoss && n > 0 && <ProfitBadge />}
    </span>
  );
}

function DeficitAlert({ netProfit, netCash, periodLabel }) {
  const profitLoss = Number(netProfit) < 0;
  const tillDeficit = Number(netCash) < 0;
  if (!profitLoss && !tillDeficit) return null;

  return (
    <div className="flex gap-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-4 sm:px-6">
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-red-900">
          {profitLoss && tillDeficit
            ? `Operating deficit ${periodLabel ? `— ${periodLabel}` : ''}`
            : profitLoss
              ? `Net loss recorded ${periodLabel ? `— ${periodLabel}` : ''}`
              : `Till cash deficit ${periodLabel ? `— ${periodLabel}` : ''}`}
        </p>
        {profitLoss && (
          <p className="text-red-800">
            <TrendingDown className="mr-1 inline h-4 w-4" />
            Net loss (after cost of goods &amp; cash paid out):{' '}
            <span className="font-semibold">{formatCurrency(netProfit)}</span>
          </p>
        )}
        {tillDeficit && (
          <p className="text-red-800">
            <TrendingDown className="mr-1 inline h-4 w-4" />
            Till deficit (revenue minus cash paid out):{' '}
            <span className="font-semibold">{formatCurrency(netCash)}</span>
          </p>
        )}
        <p className="text-xs text-red-700">Cash paid out exceeded takings for this period.</p>
      </div>
    </div>
  );
}

function formatExpenseReason(row) {
  const parts = [];
  if (row.category && row.expense_type !== 'stock_usage') {
    parts.push(EXPENSE_CATEGORY_LABELS[row.category] || row.category);
  }
  if (row.notes) parts.push(row.notes);
  if (row.receipt_ref) parts.push(`Ref: ${row.receipt_ref}`);
  return parts.length > 0 ? parts.join(' · ') : EM_DASH;
}

function formatExpenseDescription(row) {
  if (row.expense_type === 'stock_usage') {
    const qty = Number(row.quantity) || 0;
    if (row.product_name) return `${qty} × ${row.product_name}`;
  }
  return row.title || EM_DASH;
}

function ExpenseDetailTable({ lines, showDate = false, title, subtitle }) {
  if (!lines?.length) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        <p className="px-4 py-10 text-center text-sm text-gray-500 sm:px-6">No expenses recorded for this period.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              {showDate && <th>Date</th>}
              <th>Time</th>
              <th>Type</th>
              <th>Recorded by</th>
              <th>Description</th>
              <th>Reason / notes</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => {
              const type = row.expense_type || 'cash_out';
              const isStock = type === 'stock_usage';
              return (
                <tr key={row.id}>
                  {showDate && (
                    <td className="whitespace-nowrap text-gray-600">{formatDate(row.expense_date)}</td>
                  )}
                  <td className="whitespace-nowrap text-gray-600">
                    {row.created_at
                      ? formatDate(row.created_at, { hour: '2-digit', minute: '2-digit' })
                      : EM_DASH}
                  </td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        isStock ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {EXPENSE_TYPE_LABELS[type] || type}
                    </span>
                  </td>
                  <td>{row.recorded_by_name || EM_DASH}</td>
                  <td className="max-w-[14rem] truncate" title={formatExpenseDescription(row)}>
                    {formatExpenseDescription(row)}
                  </td>
                  <td className="max-w-[16rem] truncate text-gray-600" title={formatExpenseReason(row)}>
                    {formatExpenseReason(row)}
                  </td>
                  <td className={`text-right font-medium ${isStock ? 'text-purple-800' : 'text-red-800'}`}>
                    {formatCurrency(row.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

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
        const gross = Number(data.totals.gross_profit ?? data.totals.total_profit) || 0;
        const net = Number(data.totals.net_profit ?? gross) || 0;
        const cashOut = Number(data.totals.cash_expenses_total) || 0;
        data.profitLoss = {
          totalRevenue: rev,
          totalCost: Number(data.totals.total_cost) || 0,
          grossProfit: gross,
          netProfit: net,
          cashExpensesTotal: cashOut,
          stockExpensesTotal: Number(data.totals.stock_expenses_total) || 0,
          profitMargin: rev > 0 ? ((net / rev) * 100).toFixed(1) : '0.0',
          isNetLoss: net < 0,
          isGrossLoss: gross < 0,
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
              <div className="space-y-6">
                <DeficitAlert
                  netProfit={reports.dailySales?.profit ?? reports.summary?.profit}
                  netCash={reports.summary?.net_cash}
                  periodLabel={dateRange.from}
                />
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
                  <ProfitLossCurrency
                    amount={reports.dailySales?.profit ?? reports.summary?.profit ?? 0}
                    className="stat-value-currency"
                  />
                  <p className="stat-label mt-1">
                    {(Number(reports.dailySales?.profit ?? reports.summary?.profit) || 0) < 0
                      ? 'Net loss (after COGS & cash out)'
                      : 'Net profit (after COGS & cash out)'}
                  </p>
                </div>
                <div className="stat-panel text-center">
                  <ProfitLossCurrency
                    amount={reports.summary?.gross_profit ?? reports.dailySales?.grossProfit ?? 0}
                    className="stat-value-currency"
                    amountClassName={
                      (Number(reports.summary?.gross_profit ?? reports.dailySales?.grossProfit) || 0) < 0
                        ? 'text-red-700'
                        : 'text-slate-600'
                    }
                  />
                  <p className="stat-label mt-1">Gross profit (after COGS only)</p>
                </div>
                <div className="stat-panel text-center">
                  <Currency
                    amount={reports.dailySales?.averageSale ?? reports.summary?.average_sale ?? 0}
                    className="stat-value-currency text-orange-600"
                    amountClassName="text-orange-600"
                  />
                  <p className="stat-label mt-1">Average Sale</p>
                </div>
                {reports.summary?.cash_expenses_total != null && (
                  <>
                    <div className="stat-panel text-center">
                      <Currency
                        amount={reports.summary.cash_expenses_total ?? 0}
                        className="stat-value-currency text-red-600"
                        amountClassName="text-red-600"
                      />
                      <p className="stat-label mt-1">Cash paid out</p>
                    </div>
                    <div className="stat-panel text-center">
                      <Currency
                        amount={reports.summary.stock_expenses_total ?? 0}
                        className="stat-value-currency text-purple-600"
                        amountClassName="text-purple-600"
                      />
                      <p className="stat-label mt-1">Stock used from shop</p>
                    </div>
                    <div className="stat-panel text-center">
                      <ProfitLossCurrency
                        amount={reports.summary.net_cash ?? reports.summary.revenue ?? 0}
                        className="stat-value-currency"
                      />
                      <p className="stat-label mt-1">
                        {(Number(reports.summary.net_cash ?? reports.summary.revenue) || 0) < 0
                          ? 'Till deficit (revenue − cash out)'
                          : 'Net till cash'}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {reports.summary?.cash_expenses_total != null && (
                <div className={`rounded-xl border-2 p-4 sm:p-5 ${getProfitLossStyle(reports.summary.net_cash ?? reports.summary.revenue ?? 0).borderClass} bg-gradient-to-br ${getProfitLossStyle(reports.summary.net_cash ?? reports.summary.revenue ?? 0).panelGradient}`}>
                  <p className={`text-sm font-semibold ${getProfitLossStyle(reports.summary.net_cash ?? reports.summary.revenue ?? 0).labelClass}`}>
                    Till cash after payouts
                  </p>
                  <p className="mt-2 text-xs text-gray-600">
                    Revenue {formatCurrency(reports.summary.revenue ?? 0)} − Cash paid out {formatCurrency(reports.summary.cash_expenses_total ?? 0)} =
                  </p>
                  <div className="mt-2">
                    <ProfitLossCurrency
                      amount={reports.summary.net_cash ?? reports.summary.revenue ?? 0}
                      className="stat-value-currency text-xl sm:text-2xl"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {(Number(reports.summary.net_cash ?? reports.summary.revenue) || 0) < 0
                      ? 'Cash paid out exceeded revenue for this day (till deficit).'
                      : 'Cash remaining in till after payouts (stock usage tracked separately).'}
                  </p>
                </div>
              )}
              </div>
            )}

            {activeTab === 'daily' && (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
                  <h3 className="text-base font-semibold text-gray-900">Sales detail {EM_DASH} {dateRange.from}</h3>
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
                            <td>{row.cashier_name || EM_DASH}</td>
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

            {activeTab === 'daily' && (
              <ExpenseDetailTable
                lines={reports.expenseLines}
                title={`Expense detail ${EM_DASH} ${dateRange.from}`}
                subtitle="Who recorded each cash payout or stock taken from the shop, with amount and reason"
              />
            )}

            {/* Monthly Sales Report */}
            {monthlyReportFresh && (
              <div className="space-y-6">
                <DeficitAlert
                  netProfit={reports.summary?.profit}
                  netCash={reports.summary?.net_cash}
                  periodLabel={monthViewDate?.toLocaleString('default', { month: 'long', year: 'numeric' })}
                />
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
                    <div className={`stat-panel bg-gradient-to-br ${getProfitLossStyle(reports.summary.profit ?? 0).panelGradient}`}>
                      <p className={`text-xs font-medium uppercase tracking-wide ${getProfitLossStyle(reports.summary.profit ?? 0).labelClass}`}>
                        {(Number(reports.summary.profit) || 0) < 0 ? 'Net loss' : 'Net profit'}
                        {(Number(reports.summary.profit) || 0) < 0 && (
                          <span className="ml-2 inline-flex rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                            DEFICIT
                          </span>
                        )}
                      </p>
                      <ProfitLossCurrency
                        amount={reports.summary.profit ?? 0}
                        className="stat-value-currency mt-2"
                      />
                      <p className="stat-hint mt-1">After cost of goods &amp; cash paid out</p>
                    </div>
                    {reports.summary.gross_profit != null && (
                      <div className={`stat-panel bg-gradient-to-br ${getProfitLossStyle(reports.summary.gross_profit ?? 0).panelGradient}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide ${getProfitLossStyle(reports.summary.gross_profit ?? 0).labelClass}`}>
                          {(Number(reports.summary.gross_profit) || 0) < 0 ? 'Gross loss' : 'Gross profit'}
                        </p>
                        <ProfitLossCurrency
                          amount={reports.summary.gross_profit ?? 0}
                          className="stat-value-currency mt-2"
                        />
                        <p className="stat-hint mt-1">Sales minus cost of goods</p>
                      </div>
                    )}
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
                    {reports.summary.cash_expenses_total != null && (
                      <>
                        <div className="stat-panel bg-gradient-to-br from-red-50 to-white">
                          <p className="text-xs font-medium uppercase tracking-wide text-red-800">
                            Cash paid out
                          </p>
                          <Currency
                            amount={reports.summary.cash_expenses_total ?? 0}
                            className="stat-value-currency mt-2 text-red-700"
                            amountClassName="text-red-700"
                          />
                          <p className="stat-hint mt-1">Reduces till cash</p>
                        </div>
                        <div className="stat-panel bg-gradient-to-br from-purple-50 to-white">
                          <p className="text-xs font-medium uppercase tracking-wide text-purple-800">
                            Stock used
                          </p>
                          <Currency
                            amount={reports.summary.stock_expenses_total ?? 0}
                            className="stat-value-currency mt-2 text-purple-700"
                            amountClassName="text-purple-700"
                          />
                          <p className="stat-hint mt-1">At cost {EM_DASH} inventory only</p>
                        </div>
                        <div className={`stat-panel bg-gradient-to-br ${getProfitLossStyle(reports.summary.net_cash ?? reports.summary.revenue ?? 0).panelGradient}`}>
                          <p className={`text-xs font-medium uppercase tracking-wide ${getProfitLossStyle(reports.summary.net_cash ?? reports.summary.revenue ?? 0).labelClass}`}>
                            {(Number(reports.summary.net_cash ?? reports.summary.revenue) || 0) < 0 ? 'Till deficit' : 'Net till cash'}
                            {(Number(reports.summary.net_cash ?? reports.summary.revenue) || 0) < 0 && (
                              <span className="ml-2 inline-flex rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                                DEFICIT
                              </span>
                            )}
                          </p>
                          <ProfitLossCurrency
                            amount={reports.summary.net_cash ?? reports.summary.revenue ?? 0}
                            className="stat-value-currency mt-2"
                          />
                          <p className="stat-hint mt-1">Revenue minus cash paid out</p>
                        </div>
                      </>
                    )}
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
                          <th>Net profit / loss</th>
                          <th>Gross profit / loss</th>
                          <th>Cash out</th>
                          <th>Stock used</th>
                          <th>Till cash / deficit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.dailyBreakdown.map((row, index) => {
                          const expenseDay = reports.expensesByDay?.find((e) => e.day === row.day);
                          const cashOut = Number(row.cash_expenses ?? expenseDay?.cash_total ?? 0);
                          const stockUsed = Number(row.stock_expenses ?? expenseDay?.stock_total ?? 0);
                          const netCash = Number(row.revenue ?? 0) - cashOut;
                          return (
                          <tr
                            key={index}
                            className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}
                          >
                            <td className="font-medium">{formatDate(row.day)}</td>
                            <td>{row.sales_count}</td>
                            <td className="text-green-800">{formatCurrency(row.revenue)}</td>
                            <td className={profitLossCellClass(row.profit)}>{formatProfitLossTable(row.profit)}</td>
                            <td className={profitLossCellClass(row.gross_profit ?? row.profit)}>{formatProfitLossTable(row.gross_profit ?? row.profit)}</td>
                            <td className="text-red-700">{cashOut ? formatCurrency(cashOut) : EM_DASH}</td>
                            <td className="text-purple-700">{stockUsed ? formatCurrency(stockUsed) : EM_DASH}</td>
                            <td className={profitLossCellClass(netCash)}>{formatProfitLossTable(netCash)}</td>
                          </tr>
                          );
                        })}
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
                {reports.expenseLines?.length > 0 && (
                  <ExpenseDetailTable
                    lines={reports.expenseLines}
                    showDate
                    title={`Expense detail ${EM_DASH} ${monthViewDate?.toLocaleString('default', { month: 'long', year: 'numeric' })}`}
                    subtitle="Each cash payout and stock usage: who, amount, description, and reason"
                  />
                )}
              </div>
            )}

            {activeTab === 'annual' && reports.summary && (
              <div className="space-y-6">
                <DeficitAlert
                  netProfit={reports.summary.profit}
                  netCash={reports.summary.net_cash}
                  periodLabel={String(reports.year || dateRange.from.slice(0, 4))}
                />
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
                    <ProfitLossCurrency
                      amount={reports.summary.profit || 0}
                      className="stat-value-currency"
                    />
                    <p className="stat-label mt-1">
                      {(Number(reports.summary.profit) || 0) < 0
                        ? 'Net loss (after COGS & cash out)'
                        : 'Net profit (after COGS & cash out)'}
                    </p>
                  </div>
                  {reports.summary.gross_profit != null && (
                    <div className="stat-panel text-center">
                      <ProfitLossCurrency
                        amount={reports.summary.gross_profit || 0}
                        className="stat-value-currency"
                        amountClassName={
                          (Number(reports.summary.gross_profit) || 0) < 0 ? 'text-red-700' : 'text-slate-600'
                        }
                      />
                      <p className="stat-label mt-1">Gross profit (after COGS)</p>
                    </div>
                  )}
                  <div className="stat-panel text-center">
                    <Currency
                      amount={reports.summary.cash_expenses_total ?? (reports.summary.expenses_total || 0)}
                      className="stat-value-currency text-red-600"
                      amountClassName="text-red-600"
                    />
                    <p className="stat-label mt-1">Year cash out</p>
                  </div>
                  <div className="stat-panel text-center">
                    <Currency
                      amount={reports.summary.stock_expenses_total || 0}
                      className="stat-value-currency text-purple-600"
                      amountClassName="text-purple-600"
                    />
                    <p className="stat-label mt-1">Year stock used</p>
                  </div>
                  <div className="stat-panel text-center">
                    <ProfitLossCurrency
                      amount={reports.summary.net_cash ?? reports.summary.revenue}
                      className="stat-value-currency"
                    />
                    <p className="stat-label mt-1">
                      {(Number(reports.summary.net_cash ?? reports.summary.revenue) || 0) < 0
                        ? 'Till deficit (revenue − cash out)'
                        : 'Net till cash'}
                    </p>
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
                          <th>Net profit / loss</th>
                          <th>Gross profit / loss</th>
                          <th>Cash out</th>
                          <th>Stock used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.monthlyBreakdown.map((row) => (
                          <tr key={row.month}>
                            <td>{row.month}</td>
                            <td>{row.sales_count}</td>
                            <td>{formatCurrency(row.revenue)}</td>
                            <td className={profitLossCellClass(row.profit)}>{formatProfitLossTable(row.profit)}</td>
                            <td className={profitLossCellClass(row.gross_profit ?? row.profit)}>{formatProfitLossTable(row.gross_profit ?? row.profit)}</td>
                            <td className="text-red-700">
                              {row.cash_expenses ? formatCurrency(row.cash_expenses) : EM_DASH}
                            </td>
                            <td className="text-purple-700">
                              {row.stock_expenses ? formatCurrency(row.stock_expenses) : EM_DASH}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {reports.expenseLines?.length > 0 && (
                  <ExpenseDetailTable
                    lines={reports.expenseLines}
                    showDate
                    title={`Expense detail ${EM_DASH} ${reports.year}`}
                    subtitle="All cash payouts and stock taken from the shop during the year"
                  />
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
              <div className="space-y-6">
                <DeficitAlert
                  netProfit={reports.profitLoss.netProfit}
                  netCash={reports.profitLoss.totalRevenue - reports.profitLoss.cashExpensesTotal}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Revenue &amp; costs</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total sales:</span>
                      <span className="font-medium">{formatCurrency(reports.profitLoss.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost of goods sold:</span>
                      <span className="font-medium">{formatCurrency(reports.profitLoss.totalCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cash paid out:</span>
                      <span className="font-medium text-red-600">{formatCurrency(reports.profitLoss.cashExpensesTotal ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Stock used from shop:</span>
                      <span className="font-medium text-purple-700">{formatCurrency(reports.profitLoss.stockExpensesTotal ?? 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {reports.profitLoss.isNetLoss ? 'Loss summary' : 'Profit summary'}
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span>{reports.profitLoss.isGrossLoss ? 'Gross loss (after COGS):' : 'Gross profit (after COGS):'}</span>
                      <span className={profitLossCellClass(reports.profitLoss.grossProfit)}>
                        {formatProfitLossTable(reports.profitLoss.grossProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>{reports.profitLoss.isNetLoss ? 'Net loss (after COGS & cash out):' : 'Net profit (after COGS & cash out):'}</span>
                      <span className={`inline-flex items-center gap-2 ${profitLossCellClass(reports.profitLoss.netProfit)}`}>
                        {formatProfitLossTable(reports.profitLoss.netProfit ?? reports.profitLoss.grossProfit)}
                        {reports.profitLoss.isNetLoss ? <LossBadge /> : Number(reports.profitLoss.netProfit) > 0 ? <ProfitBadge /> : null}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-gray-100 pt-2">
                      <span>
                        {(reports.profitLoss.totalRevenue - reports.profitLoss.cashExpensesTotal) < 0
                          ? 'Till deficit (revenue − cash out):'
                          : 'Net till cash (revenue − cash out):'}
                      </span>
                      <span className={`inline-flex items-center gap-2 ${profitLossCellClass(reports.profitLoss.totalRevenue - reports.profitLoss.cashExpensesTotal)}`}>
                        {formatProfitLossTable(reports.profitLoss.totalRevenue - reports.profitLoss.cashExpensesTotal)}
                        {(reports.profitLoss.totalRevenue - reports.profitLoss.cashExpensesTotal) < 0
                          ? <LossBadge />
                          : (reports.profitLoss.totalRevenue - reports.profitLoss.cashExpensesTotal) > 0
                            ? <ProfitBadge />
                            : null}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{reports.profitLoss.isNetLoss ? 'Net loss margin:' : 'Net margin:'}</span>
                      <span className={`font-medium ${reports.profitLoss.isNetLoss ? 'text-red-700' : 'text-green-800'}`}>
                        {reports.profitLoss.profitMargin}%
                      </span>
                    </div>
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
            <p className="text-center text-sm text-gray-600">Building PDF preview{'\u2026'}</p>
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
          <p className="py-8 text-center text-sm text-gray-600">Preview unavailable {EM_DASH} use Download PDF.</p>
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
