export function roundUgx(value) {
  return Math.round(Number(value) || 0);
}

export function computeSaleTotals(subtotal, discountAmount = 0) {
  const sub = roundUgx(subtotal);
  const disc = roundUgx(discountAmount);
  const taxable = Math.max(0, sub - disc);
  const taxAmount = roundUgx(taxable * 0.18);
  const total = taxable + taxAmount;
  return { subtotal: sub, discountAmount: disc, taxAmount, total };
}
