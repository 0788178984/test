export function roundUgx(value) {
  return Math.round(Number(value) || 0);
}

/** Wholesale unit price = buying price + markup% (e.g. cost 2000 + 15% → 2300). */
export function calcWholesaleUnitPrice(buyingPrice, markupPercent) {
  const buy = roundUgx(buyingPrice);
  const p = Math.min(500, Math.max(0, Number(markupPercent) || 0));
  return roundUgx(buy * (1 + p / 100));
}

export function computeSaleTotals(subtotal, discountAmount = 0) {
  const sub = roundUgx(subtotal);
  const disc = roundUgx(discountAmount);
  const net = Math.max(0, sub - disc);
  return { subtotal: sub, discountAmount: disc, taxAmount: 0, total: net };
}
