/** Whole-shilling amounts for UGX (avoids POS vs server mismatch). */
function roundUgx(value) {
  return Math.round(Number(value) || 0);
}

/** Match POS cart + sales API: 18% VAT on (subtotal - discount). */
function computeSaleTotals(subtotal, discountAmount = 0) {
  const sub = roundUgx(subtotal);
  const disc = roundUgx(discountAmount);
  const taxable = Math.max(0, sub - disc);
  const taxAmount = roundUgx(taxable * 0.18);
  const totalAmount = taxable + taxAmount;
  return { subtotal: sub, discountAmount: disc, taxAmount, totalAmount };
}

module.exports = { roundUgx, computeSaleTotals };
