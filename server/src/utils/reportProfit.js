const db = require('../db/connection');

const EXPENSE_SUMMARY_SQL = `
  SELECT
    COUNT(*) as count,
    COALESCE(SUM(amount), 0) as total,
    COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
    COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
  FROM expenses
  WHERE deleted_at IS NULL AND business_id = ?
`;

function mapExpensesSummaryRow(row) {
  return {
    count: Number(row?.count ?? 0),
    total: Number(row?.total ?? 0),
    cash_total: Number(row?.cash_total ?? 0),
    stock_total: Number(row?.stock_total ?? 0),
  };
}

/** Net profit = gross margin (sales minus COGS) minus cash paid out. Stock usage is shown separately. */
function netProfitFromSummary(grossProfit, expensesSummary) {
  const gross = Number(grossProfit) || 0;
  const cashExpenses = Number(expensesSummary?.cash_total ?? 0);
  const stockExpenses = Number(expensesSummary?.stock_total ?? 0);
  const expensesTotal = Number(expensesSummary?.total ?? cashExpenses + stockExpenses);
  const net = gross - cashExpenses;
  return {
    gross_profit: gross,
    profit: net,
    is_loss: net < 0,
    expenses_total: expensesTotal,
    cash_expenses_total: cashExpenses,
    stock_expenses_total: stockExpenses,
  };
}

function isReportLoss(value) {
  return (Number(value) || 0) < 0;
}

function profitMetricLabel(value, profitLabel, lossLabel) {
  return isReportLoss(value) ? lossLabel : profitLabel;
}

/** UGX line for PDF/Excel — negative values marked as LOSS, positive as PROFIT when flagged. */
function formatUgxReportValue(value, { showProfitTag = false } = {}) {
  const n = Number(value) || 0;
  const formatted = Math.abs(n).toLocaleString();
  if (n < 0) return `-UGX ${formatted} (LOSS)`;
  if (showProfitTag && n > 0) return `UGX ${formatted} (PROFIT)`;
  return `UGX ${formatted}`;
}

async function fetchExpensesSummary(businessId, { date, from, to } = {}) {
  try {
    if (date) {
      const row = await db.prepare(`${EXPENSE_SUMMARY_SQL} AND expense_date = ?`).get(businessId, date);
      return mapExpensesSummaryRow(row);
    }
    if (from && to) {
      const row = await db
        .prepare(`${EXPENSE_SUMMARY_SQL} AND expense_date >= ? AND expense_date <= ?`)
        .get(businessId, from, to);
      return mapExpensesSummaryRow(row);
    }
    return mapExpensesSummaryRow(null);
  } catch (_) {
    return mapExpensesSummaryRow(null);
  }
}

function applyNetProfitToPeriodRows(periodRows, expensesByPeriod = [], periodKey = 'day') {
  const byKey = Object.fromEntries(expensesByPeriod.map((e) => [String(e[periodKey] ?? e.day ?? e.month), e]));
  return periodRows.map((row) => {
    const key = String(row[periodKey] ?? row.day ?? row.month);
    const exp = byKey[key] || {};
    const gross = Number(row.profit || 0);
    const cash = Number(exp.cash_total || 0);
    const stock = Number(exp.stock_total || 0);
    return {
      ...row,
      gross_profit: gross,
      profit: gross - cash,
      cash_expenses: cash,
      stock_expenses: stock,
    };
  });
}

module.exports = {
  netProfitFromSummary,
  fetchExpensesSummary,
  applyNetProfitToPeriodRows,
  mapExpensesSummaryRow,
  isReportLoss,
  profitMetricLabel,
  formatUgxReportValue,
};
