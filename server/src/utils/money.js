/** Whole-shilling amounts for UGX (avoids POS vs server mismatch). */
function roundUgx(value) {
  return Math.round(Number(value) || 0);
}

/** Match POS cart + sales API: total = subtotal − discount (no VAT). */
function computeSaleTotals(subtotal, discountAmount = 0) {
  const sub = roundUgx(subtotal);
  const disc = roundUgx(discountAmount);
  const net = Math.max(0, sub - disc);
  return { subtotal: sub, discountAmount: disc, taxAmount: 0, totalAmount: net };
}

module.exports = { roundUgx, computeSaleTotals };
