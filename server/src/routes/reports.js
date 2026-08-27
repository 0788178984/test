const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { getStoreToday, saleLocalDate, STORE_TZ } = require('../utils/storeTime');
const { SALE_LINE_COST } = require('../utils/saleSql');
const {
  netProfitFromSummary,
  fetchExpensesSummary,
  applyNetProfitToPeriodRows,
} = require('../utils/reportProfit');
const pdfService = require('../services/pdfService');

const LD = saleLocalDate('s.created_at');
const LOCAL_HOUR = `LPAD(EXTRACT(HOUR FROM (s.created_at AT TIME ZONE '${STORE_TZ}'))::text, 2, '0')`;
const LOCAL_YEAR = `EXTRACT(YEAR FROM (s.created_at AT TIME ZONE '${STORE_TZ}'))`;
const LOCAL_MONTH = `EXTRACT(MONTH FROM (s.created_at AT TIME ZONE '${STORE_TZ}'))`;
const LOCAL_DAY = saleLocalDate('s.created_at');
const excelService = require('../services/excelService');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const EXPORT_REPORT_TYPES = new Set([
  'daily',
  'monthly',
  'annual',
  'profit',
  'best-sellers',
  'cashier',
  'sales',
  'products',
]);

/** Full calendar month containing `from` (YYYY-MM-DD). */
function monthExportRange(from) {
  const [y, m] = String(from).slice(0, 7).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return {
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Expense line items for reports (who, amount, type, reason). Returns [] if table missing. */
async function fetchExpenseLines(businessId, { date, from, to } = {}) {
  try {
    let where = 'e.deleted_at IS NULL AND e.business_id = ?';
    const params = [businessId];

    if (date) {
      where += ' AND e.expense_date = ?';
      params.push(date);
    } else if (from && to) {
      where += ' AND e.expense_date >= ? AND e.expense_date <= ?';
      params.push(from, to);
    }

    return await db
      .prepare(
        `
      SELECT
        e.id,
        e.expense_date,
        e.created_at,
        COALESCE(e.expense_type, 'cash_out') as expense_type,
        e.title,
        e.category,
        e.amount,
        e.payment_method,
        e.notes,
        e.receipt_ref,
        e.quantity,
        u.name as recorded_by_name,
        p.name as product_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN products p ON p.id = e.product_id
      WHERE ${where}
      ORDER BY e.expense_date DESC, e.created_at DESC
    `
      )
      .all(...params);
  } catch (_) {
    return [];
  }
}

function sendGeneratedExportFile(res, result) {
  if (!result.success) return false;
  const buf = fs.readFileSync(result.filepath);
  try {
    fs.unlinkSync(result.filepath);
  } catch (_) {
    /* ignore */
  }
  const ext = path.extname(result.filename).replace('.', '').toLowerCase();
  const mime =
    ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(buf);
  return true;
}

// Daily report
router.get('/daily', checkPermission('view_reports'), async (req, res) => {
  try {
    const date = req.query.date || req.query.from || getStoreToday();

    let query = `
      SELECT 
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(subtotal) as gross_sales,
        SUM(discount_amount) as total_discount,
        SUM(tax_amount) as total_tax,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price) 
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const params = [date, req.user.business_id];

    const summary = await db.prepare(query).get(...params);

    let paymentQuery = `
      SELECT payment_method, COUNT(*) as count, SUM(total_amount) as amount
      FROM sales s
      WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const paymentParams = [date, req.user.business_id];

    paymentQuery += ` GROUP BY payment_method`;

    const paymentMethods = await db.prepare(paymentQuery).all(...paymentParams);

    let hourlyQuery = `
      SELECT
        ${LOCAL_HOUR} as hour,
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue
      FROM sales s
      WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const hourlyParams = [date, req.user.business_id];

    hourlyQuery += ` GROUP BY ${LOCAL_HOUR} ORDER BY hour`;

    const hourlySales = await db.prepare(hourlyQuery).all(...hourlyParams);

    let expensesSummary = await fetchExpensesSummary(req.user.business_id, { date });

    const revenue = Number(summary.revenue || 0);
    const salesCount = Number(summary.sales_count || 0);
    const profitSummary = netProfitFromSummary(summary.profit, expensesSummary);

    const saleLines = await db.prepare(`
      SELECT
        s.sale_number,
        s.total_amount,
        s.created_at,
        u.name as cashier_name,
        c.name as customer_name,
        si.product_name,
        si.quantity,
        si.line_total
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE ${LD} = ?
        AND s.status = 'completed'
        AND s.deleted_at IS NULL
        AND s.business_id = ?
      ORDER BY s.created_at DESC, si.product_name ASC
    `).all(date, req.user.business_id);

    const expenseLines = await fetchExpenseLines(req.user.business_id, { date });

    res.json({
      date,
      summary: {
        sales_count: salesCount,
        revenue: summary.revenue || 0,
        gross_sales: summary.gross_sales || 0,
        total_discount: summary.total_discount || 0,
        total_tax: summary.total_tax || 0,
        gross_profit: profitSummary.gross_profit,
        profit: profitSummary.profit,
        expenses_count: expensesSummary.count,
        expenses_total: profitSummary.expenses_total,
        cash_expenses_total: profitSummary.cash_expenses_total,
        stock_expenses_total: profitSummary.stock_expenses_total,
        net_cash: revenue - profitSummary.cash_expenses_total,
        average_sale: salesCount > 0 ? Math.round(revenue / salesCount) : 0,
      },
      dailySales: {
        salesCount,
        revenue: summary.revenue || 0,
        grossProfit: profitSummary.gross_profit,
        profit: profitSummary.profit,
        averageSale: salesCount > 0 ? Math.round(revenue / salesCount) : 0,
      },
      saleLines,
      expenseLines,
      paymentMethods,
      hourlySales,
    });
  } catch (error) {
    console.error('Get daily report error:', error);
    res.status(500).json({ error: 'Failed to fetch daily report.' });
  }
});

// Monthly report
router.get('/monthly', checkPermission('view_reports'), async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;

    let query = `
      SELECT 
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(subtotal) as gross_sales,
        SUM(discount_amount) as total_discount,
        SUM(tax_amount) as total_tax,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price) 
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${LOCAL_YEAR} = ? 
      AND ${LOCAL_MONTH} = ? 
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const params = [parseInt(year, 10), parseInt(month, 10), req.user.business_id];

    const summary = await db.prepare(query).get(...params);

    let dailyQuery = `
      SELECT
        ${LOCAL_DAY} as day,
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price)
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${LOCAL_YEAR} = ?
      AND ${LOCAL_MONTH} = ?
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const dailyParams = [parseInt(year, 10), parseInt(month, 10), req.user.business_id];

    dailyQuery += ` GROUP BY ${LOCAL_DAY} ORDER BY day`;

    const dailyBreakdown = await db.prepare(dailyQuery).all(...dailyParams);

    const monthStart = `${parseInt(year, 10)}-${String(parseInt(month, 10)).padStart(2, '0')}-01`;
    const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
    const monthEnd = `${parseInt(year, 10)}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let expensesSummary = { count: 0, total: 0, cash_total: 0, stock_total: 0 };
    let expensesByDay = [];
    try {
      const exp = await db
        .prepare(
          `
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
        FROM expenses
        WHERE deleted_at IS NULL AND business_id = ?
          AND expense_date >= ? AND expense_date <= ?
      `
        )
        .get(req.user.business_id, monthStart, monthEnd);

      expensesSummary = {
        count: Number(exp?.count ?? 0),
        total: Number(exp?.total ?? 0),
        cash_total: Number(exp?.cash_total ?? 0),
        stock_total: Number(exp?.stock_total ?? 0),
      };

      expensesByDay = await db
        .prepare(
          `
        SELECT
          expense_date as day,
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
        FROM expenses
        WHERE deleted_at IS NULL AND business_id = ?
          AND expense_date >= ? AND expense_date <= ?
        GROUP BY expense_date
        ORDER BY day
      `
        )
        .all(req.user.business_id, monthStart, monthEnd);
    } catch (_) {
      /* optional */
    }

    const revenue = Number(summary.revenue || 0);
    const profitSummary = netProfitFromSummary(summary.profit, expensesSummary);

    const expenseLines = await fetchExpenseLines(req.user.business_id, { from: monthStart, to: monthEnd });

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      summary: {
        sales_count: summary.sales_count || 0,
        revenue: summary.revenue || 0,
        gross_sales: summary.gross_sales || 0,
        total_discount: summary.total_discount || 0,
        total_tax: summary.total_tax || 0,
        gross_profit: profitSummary.gross_profit,
        profit: profitSummary.profit,
        expenses_count: expensesSummary.count,
        expenses_total: profitSummary.expenses_total,
        cash_expenses_total: profitSummary.cash_expenses_total,
        stock_expenses_total: profitSummary.stock_expenses_total,
        net_cash: revenue - profitSummary.cash_expenses_total,
      },
      dailyBreakdown: applyNetProfitToPeriodRows(dailyBreakdown, expensesByDay, 'day'),
      expensesByDay,
      expenseLines,
    });
  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly report.' });
  }
});

// Annual report (admin / manager only — view_reports)
router.get('/annual', checkPermission('view_reports'), async (req, res) => {
  try {
    const year = parseInt(req.query.year || getStoreToday().slice(0, 4), 10);

    const summary = await db
      .prepare(
        `
      SELECT 
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(subtotal) as gross_sales,
        SUM(discount_amount) as total_discount,
        SUM(tax_amount) as total_tax,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price) 
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${LOCAL_YEAR} = ?
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND s.business_id = ?
    `
      )
      .get(year, req.user.business_id);

    const monthlyBreakdown = await db
      .prepare(
        `
      SELECT
        ${LOCAL_MONTH}::int as month,
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price)
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${LOCAL_YEAR} = ?
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND s.business_id = ?
      GROUP BY ${LOCAL_MONTH}
      ORDER BY month
    `
      )
      .all(year, req.user.business_id);

    let expensesSummary = { count: 0, total: 0, cash_total: 0, stock_total: 0 };
    let expensesByMonth = [];
    try {
      const exp = await db
        .prepare(
          `
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
        FROM expenses
        WHERE deleted_at IS NULL AND business_id = ?
          AND expense_date >= ? AND expense_date <= ?
      `
        )
        .get(req.user.business_id, `${year}-01-01`, `${year}-12-31`);

      expensesSummary = {
        count: Number(exp?.count ?? 0),
        total: Number(exp?.total ?? 0),
        cash_total: Number(exp?.cash_total ?? 0),
        stock_total: Number(exp?.stock_total ?? 0),
      };

      expensesByMonth = await db
        .prepare(
          `
        SELECT
          EXTRACT(MONTH FROM expense_date::date)::int as month,
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
        FROM expenses
        WHERE deleted_at IS NULL AND business_id = ?
          AND expense_date >= ? AND expense_date <= ?
        GROUP BY EXTRACT(MONTH FROM expense_date::date)
        ORDER BY month
      `
        )
        .all(req.user.business_id, `${year}-01-01`, `${year}-12-31`);
    } catch (_) {
      /* optional */
    }

    const revenue = Number(summary.revenue || 0);
    const profitSummary = netProfitFromSummary(summary.profit, expensesSummary);

    const expenseLines = await fetchExpenseLines(req.user.business_id, {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    });

    res.json({
      year,
      summary: {
        sales_count: summary.sales_count || 0,
        revenue: summary.revenue || 0,
        gross_sales: summary.gross_sales || 0,
        total_discount: summary.total_discount || 0,
        total_tax: summary.total_tax || 0,
        gross_profit: profitSummary.gross_profit,
        profit: profitSummary.profit,
        expenses_count: expensesSummary.count,
        expenses_total: profitSummary.expenses_total,
        cash_expenses_total: profitSummary.cash_expenses_total,
        stock_expenses_total: profitSummary.stock_expenses_total,
        net_cash: revenue - profitSummary.cash_expenses_total,
      },
      monthlyBreakdown: applyNetProfitToPeriodRows(monthlyBreakdown, expensesByMonth, 'month'),
      expenseLines,
    });
  } catch (error) {
    console.error('Get annual report error:', error);
    res.status(500).json({ error: 'Failed to fetch annual report.' });
  }
});

// Profit report
router.get('/profit', checkPermission('view_reports'), async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'From and to dates are required.' });
    }

    let query = `
      SELECT 
        s.id,
        s.sale_number,
        s.created_at,
        s.total_amount as revenue,
        ${SALE_LINE_COST} as cost,
        (s.total_amount - ${SALE_LINE_COST}) as profit,
        u.name as cashier_name,
        c.name as customer_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE ${LD} >= ? 
      AND ${LD} <= ?
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const params = [from, to, req.user.business_id];

    // Cashiers can only see their own reports
    if (req.user.role === 'cashier') {
      query += ` AND s.cashier_id = ?`;
      params.push(req.user.id);
    }

    query += ` ORDER BY s.created_at DESC`;

    const sales = await db.prepare(query).all(...params);

    // Calculate totals
    const totals = sales.reduce((acc, sale) => ({
      total_revenue: acc.total_revenue + sale.revenue,
      total_cost: acc.total_cost + sale.cost,
      total_profit: acc.total_profit + sale.profit
    }), { total_revenue: 0, total_cost: 0, total_profit: 0 });

    const expensesSummary = await fetchExpensesSummary(req.user.business_id, { from, to });
    const profitSummary = netProfitFromSummary(totals.total_profit, expensesSummary);

    res.json({
      from,
      to,
      sales,
      totals: {
        ...totals,
        gross_profit: profitSummary.gross_profit,
        net_profit: profitSummary.profit,
        cash_expenses_total: profitSummary.cash_expenses_total,
        stock_expenses_total: profitSummary.stock_expenses_total,
      },
      expensesSummary,
    });
  } catch (error) {
    console.error('Get profit report error:', error);
    res.status(500).json({ error: 'Failed to fetch profit report.' });
  }
});

// Best sellers report
router.get('/best-sellers', checkPermission('view_reports'), async (req, res) => {
  try {
    const { from, to, limit = 10 } = req.query;

    let query = `
      SELECT 
        p.id,
        p.name,
        p.category,
        SUM(si.quantity) as total_quantity,
        SUM(si.line_total) as total_revenue,
        COUNT(DISTINCT si.sale_id) as sales_count,
        AVG(si.unit_price) as avg_price
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'completed' AND s.deleted_at IS NULL AND s.business_id = ?
    `;

    const params = [req.user.business_id];

    if (from) {
      query += ` AND ${LD} >= ?`;
      params.push(from);
    }

    if (to) {
      query += ` AND ${LD} <= ?`;
      params.push(to);
    }

    // Cashiers can only see their own reports
    if (req.user.role === 'cashier') {
      query += ` AND s.cashier_id = ?`;
      params.push(req.user.id);
    }

    query += `
      GROUP BY si.product_id, p.id, p.name, p.category
      ORDER BY total_quantity DESC
      LIMIT ?
    `;

    params.push(parseInt(limit));

    const bestSellers = await db.prepare(query).all(...params);

    res.json({
      from,
      to,
      bestSellers
    });
  } catch (error) {
    console.error('Get best sellers error:', error);
    res.status(500).json({ error: 'Failed to fetch best sellers report.' });
  }
});

// Cashier performance report
router.get('/cashier', checkPermission('view_reports'), async (req, res) => {
  try {
    const { user_id, from, to } = req.query;

    // Only admins and managers can view other cashiers' reports
    if (req.user.role === 'cashier' && user_id && user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    let query = `
      SELECT
        u.id,
        u.name,
        u.role,
        COUNT(s.id) as sales_count,
        SUM(s.total_amount) as total_revenue,
        SUM(s.total_amount - (SELECT SUM(si.quantity * si.buying_price)
                           FROM sale_items si WHERE si.sale_id = s.id)) as total_profit,
        AVG(s.total_amount) as avg_sale_value,
        MAX(s.total_amount) as max_sale_value
      FROM users u
      LEFT JOIN sales s ON u.id = s.cashier_id
        AND s.status = 'completed'
        AND s.deleted_at IS NULL
        AND s.business_id = ?
      WHERE u.business_id = ?
    `;

    const params = [req.user.business_id, req.user.business_id];

    if (user_id) {
      query += ` AND u.id = ?`;
      params.push(user_id);
    }

    if (from) {
      query += ` AND ${LD} >= ?`;
      params.push(from);
    }

    if (to) {
      query += ` AND ${LD} <= ?`;
      params.push(to);
    }

    if (req.user.role === 'cashier') {
      query += ` AND u.id = ?`;
      params.push(req.user.id);
    }

    query += ` GROUP BY u.id, u.name, u.role ORDER BY total_revenue DESC`;

    const cashierStats = await db.prepare(query).all(...params);

    res.json({
      from,
      to,
      cashierStats
    });
  } catch (error) {
    console.error('Get cashier report error:', error);
    res.status(500).json({ error: 'Failed to fetch cashier report.' });
  }
});

// Get report data for export (JSON) or generated file (PDF / XLSX)
router.get('/export-data', checkPermission('export_reports'), async (req, res) => {
  try {
    const { from, to } = req.query;
    let reportType = String(req.query.type || req.query.report_type || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');

    if (!from || !to) {
      return res.status(400).json({ error: 'From and to dates are required.' });
    }

    let exportFrom = from;
    let exportTo = to;
    if (reportType === 'monthly') {
      ({ from: exportFrom, to: exportTo } = monthExportRange(from));
    } else if (reportType === 'annual') {
      const year = String(from).slice(0, 4);
      exportFrom = `${year}-01-01`;
      exportTo = `${year}-12-31`;
    }

    if (!EXPORT_REPORT_TYPES.has(reportType)) {
      return res.status(400).json({
        error: `Invalid report type. Use one of: ${[...EXPORT_REPORT_TYPES].join(', ')}.`,
      });
    }

    const format = String(req.query.format || 'json').toLowerCase();
    const exportOptions = {
      business_id: req.user.business_id,
      ...(req.user.role === 'cashier' ? { cashier_id: req.user.id } : {}),
    };

    if (format === 'pdf' || format === 'xlsx' || format === 'excel') {
      const isExcel = format === 'xlsx' || format === 'excel';
      let result;

      if (isExcel) {
        switch (reportType) {
          case 'daily':
            result =
              exportFrom === exportTo
                ? await excelService.generateDailyReport(exportFrom, exportOptions)
                : await excelService.generateSalesReport(exportFrom, exportTo, exportOptions);
            break;
          case 'monthly':
          case 'cashier':
          case 'sales':
          case 'products':
            result = await excelService.generateSalesReport(exportFrom, exportTo, exportOptions);
            break;
          case 'profit':
            result = await excelService.generateProfitReport(exportFrom, exportTo, exportOptions);
            break;
          case 'best-sellers':
            result = await excelService.generateBestSellersReport(exportFrom, exportTo, exportOptions);
            break;
          default:
            result = await excelService.generateSalesReport(exportFrom, exportTo, exportOptions);
        }
      } else {
        switch (reportType) {
          case 'daily':
            result =
              exportFrom === exportTo
                ? await pdfService.generateDailyReport(exportFrom, exportOptions)
                : await pdfService.generateSalesReport(exportFrom, exportTo, exportOptions);
            break;
          case 'monthly':
          case 'cashier':
          case 'sales':
          case 'products':
          case 'best-sellers':
            result = await pdfService.generateSalesReport(exportFrom, exportTo, exportOptions);
            break;
          case 'profit':
            result = await pdfService.generateProfitReport(exportFrom, exportTo, exportOptions);
            break;
          default:
            result = await pdfService.generateSalesReport(exportFrom, exportTo, exportOptions);
        }
      }

      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Export generation failed.' });
      }
      sendGeneratedExportFile(res, result);
      return;
    }

    let data = {};

    switch (reportType) {
      case 'daily': {
        let dailyQuery = `
          SELECT 
            ${LOCAL_DAY} as date,
            COUNT(*) as sales_count,
            SUM(s.total_amount) as revenue,
            SUM(s.total_amount - (SELECT COALESCE(SUM(si.quantity * si.buying_price), 0)
                               FROM sale_items si WHERE si.sale_id = s.id)) as profit
          FROM sales s
          WHERE ${LD} >= ? 
          AND ${LD} <= ?
          AND s.status = 'completed' 
          AND s.deleted_at IS NULL
          AND s.business_id = ?
        `;

        const dailyParams = [exportFrom, exportTo, req.user.business_id];

        dailyQuery += ` GROUP BY ${LOCAL_DAY} ORDER BY date`;

        data.dailySales = await db.prepare(dailyQuery).all(...dailyParams);
        break;
      }

      case 'monthly': {
        const monthLabel = `to_char((s.created_at AT TIME ZONE '${STORE_TZ}'), 'YYYY-MM')`;
        let monthlyQuery = `
          SELECT 
            ${monthLabel} as month,
            COUNT(*) as sales_count,
            SUM(s.total_amount) as revenue,
            SUM(s.total_amount - (SELECT COALESCE(SUM(si.quantity * si.buying_price), 0)
                               FROM sale_items si WHERE si.sale_id = s.id)) as profit
          FROM sales s
          WHERE ${LD} >= ? 
          AND ${LD} <= ?
          AND s.status = 'completed' 
          AND s.deleted_at IS NULL
          AND s.business_id = ?
        `;
        const monthlyParams = [exportFrom, exportTo, req.user.business_id];
        monthlyQuery += ` GROUP BY ${monthLabel} ORDER BY month`;
        const rows = await db.prepare(monthlyQuery).all(...monthlyParams);
        let expensesByMonth = [];
        try {
          expensesByMonth = await db
            .prepare(
              `
            SELECT
              to_char(expense_date::date, 'YYYY-MM') as month,
              COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
              COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
            FROM expenses
            WHERE deleted_at IS NULL AND business_id = ?
              AND expense_date >= ? AND expense_date <= ?
            GROUP BY to_char(expense_date::date, 'YYYY-MM')
          `
            )
            .all(req.user.business_id, exportFrom, exportTo);
        } catch (_) {
          /* optional */
        }

        data.monthlySales = applyNetProfitToPeriodRows(
          rows.map((r) => ({ ...r, month: r.month })),
          expensesByMonth,
          'month'
        ).map((r) => {
          const revenue = Number(r.revenue) || 0;
          const gross = Number(r.gross_profit ?? r.profit) || 0;
          const net = Number(r.profit) || 0;
          return {
            month: r.month,
            salesCount: r.sales_count,
            revenue,
            grossProfit: gross,
            profit: net,
            profitMargin: revenue > 0 ? ((net / revenue) * 100).toFixed(1) : '0.0',
          };
        });
        break;
      }

      case 'profit': {
        let profitQuery = `
          SELECT 
            s.id,
            s.sale_number,
            s.created_at,
            s.total_amount as revenue,
            ${SALE_LINE_COST} as cost,
            (s.total_amount - ${SALE_LINE_COST}) as profit,
            u.name as cashier_name,
            c.name as customer_name
          FROM sales s
          LEFT JOIN users u ON s.cashier_id = u.id
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE ${LD} >= ? 
          AND ${LD} <= ?
          AND s.status = 'completed' 
          AND s.deleted_at IS NULL
          AND s.business_id = ?
        `;
        const profitParams = [exportFrom, exportTo, req.user.business_id];
        if (req.user.role === 'cashier') {
          profitQuery += ` AND s.cashier_id = ?`;
          profitParams.push(req.user.id);
        }
        profitQuery += ` ORDER BY s.created_at DESC`;
        const sales = await db.prepare(profitQuery).all(...profitParams);
        const totals = sales.reduce(
          (acc, sale) => ({
            totalRevenue: acc.totalRevenue + (Number(sale.revenue) || 0),
            totalCost: acc.totalCost + (Number(sale.cost) || 0),
            totalProfit: acc.totalProfit + (Number(sale.profit) || 0),
          }),
          { totalRevenue: 0, totalCost: 0, totalProfit: 0 }
        );
        const grossProfit = totals.totalProfit;
        const expensesSummary = await fetchExpensesSummary(req.user.business_id, { from: exportFrom, to: exportTo });
        const profitSummary = netProfitFromSummary(grossProfit, expensesSummary);
        const profitMargin =
          totals.totalRevenue > 0 ? ((profitSummary.profit / totals.totalRevenue) * 100).toFixed(1) : '0.0';
        data.profitLoss = {
          totalRevenue: totals.totalRevenue,
          totalCost: totals.totalCost,
          grossProfit,
          netProfit: profitSummary.profit,
          cashExpensesTotal: profitSummary.cash_expenses_total,
          stockExpensesTotal: profitSummary.stock_expenses_total,
          profitMargin,
          sales,
        };
        break;
      }

      case 'best-sellers': {
        let bestQuery = `
          SELECT 
            p.id,
            p.name,
            p.category,
            SUM(si.quantity) as total_quantity,
            SUM(si.line_total) as total_revenue,
            COUNT(DISTINCT si.sale_id) as sales_count,
            AVG(si.unit_price) as avg_price,
            SUM(si.quantity * si.buying_price) as total_cost
          FROM sale_items si
          JOIN products p ON si.product_id = p.id
          JOIN sales s ON si.sale_id = s.id
          WHERE s.status = 'completed' AND s.deleted_at IS NULL AND p.deleted_at IS NULL
          AND s.business_id = ?
          AND ${LD} >= ?
          AND ${LD} <= ?
        `;
        const bestParams = [req.user.business_id, exportFrom, exportTo];
        if (req.user.role === 'cashier') {
          bestQuery += ` AND s.cashier_id = ?`;
          bestParams.push(req.user.id);
        }
        bestQuery += `
          GROUP BY si.product_id, p.id, p.name, p.category
          ORDER BY total_quantity DESC
          LIMIT 100
        `;
        const bestSellers = await db.prepare(bestQuery).all(...bestParams);
        data.bestSellers = bestSellers.map((p) => {
          const rev = Number(p.total_revenue) || 0;
          const cost = Number(p.total_cost) || 0;
          const margin = rev > 0 && cost > 0 ? (((rev - cost) / rev) * 100).toFixed(1) : '0.0';
          return {
            name: p.name,
            category: p.category,
            totalQuantity: p.total_quantity,
            totalRevenue: rev,
            profitMargin: margin,
          };
        });
        break;
      }

      case 'cashier': {
        let cashQuery = `
          SELECT 
            u.id,
            u.name,
            u.role,
            COUNT(s.id) as sales_count,
            SUM(s.total_amount) as total_revenue,
            SUM(s.total_amount - (SELECT COALESCE(SUM(si.quantity * si.buying_price), 0)
                           FROM sale_items si WHERE si.sale_id = s.id)) as total_profit,
            AVG(s.total_amount) as avg_sale_value,
            MAX(s.total_amount) as max_sale_value
          FROM users u
          LEFT JOIN sales s ON u.id = s.cashier_id
            AND s.status = 'completed'
            AND s.deleted_at IS NULL
            AND s.business_id = ?
            AND ${LD} >= ?
            AND ${LD} <= ?
          WHERE u.role = 'cashier' AND u.deleted_at IS NULL AND u.business_id = ?
        `;
        const cashParams = [req.user.business_id, exportFrom, exportTo, req.user.business_id];
        if (req.user.role === 'cashier') {
          cashQuery += ` AND u.id = ?`;
          cashParams.push(req.user.id);
        }
        cashQuery += ` GROUP BY u.id, u.name, u.role ORDER BY total_revenue DESC`;
        const cashierStats = await db.prepare(cashQuery).all(...cashParams);
        data.cashierPerformance = cashierStats.map((c) => {
          const rev = Number(c.total_revenue) || 0;
          const cnt = Number(c.sales_count) || 0;
          const avg = cnt > 0 ? rev / cnt : 0;
          let performance = 'average';
          if (cnt >= 20 && rev > 500000) performance = 'excellent';
          else if (cnt >= 10 && rev > 200000) performance = 'good';
          return {
            name: c.name,
            salesCount: c.sales_count,
            totalRevenue: rev,
            averageSale: avg,
            performance,
          };
        });
        break;
      }

      case 'sales': {
        let salesQuery = `
          SELECT 
            s.sale_number,
            s.created_at,
            u.name as cashier_name,
            c.name as customer_name,
            s.total_amount,
            s.payment_method,
            s.discount_amount
          FROM sales s
          LEFT JOIN users u ON s.cashier_id = u.id
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE ${LD} >= ? 
          AND ${LD} <= ?
          AND s.status = 'completed' 
          AND s.deleted_at IS NULL
          AND s.business_id = ?
        `;

        const salesParams = [exportFrom, exportTo, req.user.business_id];

        if (req.user.role === 'cashier') {
          salesQuery += ` AND s.cashier_id = ?`;
          salesParams.push(req.user.id);
        }

        salesQuery += ` ORDER BY s.created_at`;

        data.sales = await db.prepare(salesQuery).all(...salesParams);

        for (const sale of data.sales) {
          sale.items = await db.prepare(`
            SELECT product_name, quantity, unit_price, line_total
            FROM sale_items
            WHERE sale_id = (SELECT id FROM sales WHERE sale_number = ? AND business_id = ?)
          `).all(sale.sale_number, req.user.business_id);
        }
        break;
      }

      case 'products': {
        let productQuery = `
          SELECT 
            p.name,
            p.category,
            p.current_stock,
            p.buying_price,
            p.selling_price,
            COALESCE(SUM(si.quantity), 0) as sold_quantity,
            COALESCE(SUM(si.line_total), 0) as total_revenue
          FROM products p
          LEFT JOIN sale_items si ON p.id = si.product_id
          LEFT JOIN sales s ON si.sale_id = s.id
            AND s.status = 'completed'
            AND s.deleted_at IS NULL
            AND s.business_id = ?
            AND ${LD} >= ?
            AND ${LD} <= ?
          WHERE p.deleted_at IS NULL AND p.business_id = ?
        `;

        const productParams = [req.user.business_id, exportFrom, exportTo, req.user.business_id];

        if (req.user.role === 'cashier') {
          productQuery += ` AND (s.id IS NULL OR s.cashier_id = ?)`;
          productParams.push(req.user.id);
        }

        productQuery += ` GROUP BY p.id, p.name, p.category, p.current_stock, p.buying_price, p.selling_price ORDER BY total_revenue DESC`;

        data.products = await db.prepare(productQuery).all(...productParams);
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid report type.' });
    }

    res.json({
      type: reportType,
      from,
      to,
      data,
    });
  } catch (error) {
    console.error('Get export data error:', error);
    res.status(500).json({ error: 'Failed to fetch export data.' });
  }
});

module.exports = router;
