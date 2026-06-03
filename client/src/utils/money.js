export function roundUgx(value) {
  return Math.round(Number(value) || 0);
}

export function computeSaleTotals(subtotal, discountAmount = 0) {
  const sub = roundUgx(subtotal);
  const disc = roundUgx(discountAmount);
  const net = Math.max(0, sub - disc);
  return { subtotal: sub, discountAmount: disc, taxAmount: 0, total: net };
}
