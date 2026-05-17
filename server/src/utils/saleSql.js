/** Per-sale cost subquery (PostgreSQL-safe, no GROUP BY on joined names). */
const SALE_LINE_COST =
  '(SELECT COALESCE(SUM(si.quantity * si.buying_price), 0) FROM sale_items si WHERE si.sale_id = s.id)';

module.exports = { SALE_LINE_COST };
