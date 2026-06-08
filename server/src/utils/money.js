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

/** Wholesale unit price = buying price + markup% on cost. */
function calcWholesaleUnitPrice(buyingPrice, markupPercent) {
  const buy = roundUgx(buyingPrice);
  const p = Math.min(500, Math.max(0, Number(markupPercent) || 0));
  return roundUgx(buy * (1 + p / 100));
}

/** Reject selling below cost — returns { ok, buy, sell } or { ok: false, error }. */
function assertSellingNotBelowCost(buyingPrice, sellingPrice) {
  const buy = roundUgx(buyingPrice);
  const sell = roundUgx(sellingPrice);
  if (sell < buy) {
    return {
      ok: false,
      error: `Selling price (UGX ${sell.toLocaleString()}) cannot be lower than buying price (UGX ${buy.toLocaleString()}).`,
    };
  }
  return { ok: true, buy, sell };
}

module.exports = { roundUgx, computeSaleTotals, assertSellingNotBelowCost, calcWholesaleUnitPrice };
