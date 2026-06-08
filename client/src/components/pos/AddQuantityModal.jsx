import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../api/client';
import Currency from '../ui/Currency';
import { calcWholesaleUnitPrice } from '../../utils/money';
import Button from '../ui/Button';

const WEIGHT_UNITS = new Set(['kg', 'kilogram', 'g', 'gram', 'litre', 'liter', 'l']);

export function isSoldByWeight(product) {
  const u = String(product?.unit || '').toLowerCase();
  return WEIGHT_UNITS.has(u);
}

export function unitLabel(product) {
  const u = String(product?.unit || 'piece').toLowerCase();
  if (u === 'kilogram') return 'kg';
  if (u === 'liter' || u === 'l') return 'L';
  if (u === 'gram' || u === 'g') return 'g';
  return product?.unit || 'piece';
}

/** Step for +/- controls in cart (and similar). */
export function quantityStepForUnit(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'g' || u === 'gram') return 1;
  if (WEIGHT_UNITS.has(u)) return 0.05;
  return 1;
}

export function quantityMinForUnit(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'g' || u === 'gram') return 1;
  if (WEIGHT_UNITS.has(u)) return 0.05;
  return 1;
}

/**
 * Choose quantity (and wholesale markup when enabled) before adding to cart.
 */
const AddQuantityModal = ({
  product,
  onConfirm,
  onCancel,
  wholesaleMode = false,
  defaultMarkupPercent = 10,
}) => {
  const byWeight = isSoldByWeight(product);
  const label = unitLabel(product);
  const [qty, setQty] = useState(1);
  const [markupPercent, setMarkupPercent] = useState(String(defaultMarkupPercent || 10));

  useEffect(() => {
    setQty(1);
    setMarkupPercent(String(defaultMarkupPercent || 10));
  }, [product?.id, defaultMarkupPercent]);

  const isGram = String(product?.unit || '').toLowerCase() === 'g' || String(product?.unit || '').toLowerCase() === 'gram';
  const step = byWeight ? (isGram ? 1 : 0.05) : 1;
  const min = byWeight ? (isGram ? 1 : 0.05) : 1;

  const presets = byWeight
    ? isGram
      ? [100, 250, 500, 1000]
      : [0.25, 0.5, 1, 2, 5, 10]
    : [1, 2, 3, 5, 10, 12];

  const markup = Number(markupPercent);
  const unitPrice = wholesaleMode
    ? calcWholesaleUnitPrice(product.buying_price, markup)
    : Number(product.selling_price) || 0;
  const lineTotal = unitPrice * (Number(qty) || 0);
  const maxQty = Number(product.current_stock) || 0;

  const submit = () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n < min) return;
    if (n > maxQty + 1e-6) {
      window.alert(`Only ${maxQty} ${label} available in stock.`);
      return;
    }
    if (wholesaleMode) {
      if (!Number.isFinite(markup) || markup <= 0 || markup > 500) {
        window.alert('Enter a markup percentage between 1 and 500.');
        return;
      }
      onConfirm(n, { wholesaleMarkupPercent: markup });
      return;
    }
    onConfirm(n);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="qty-title"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 id="qty-title" className="text-lg font-semibold text-gray-900">
              {wholesaleMode ? 'Wholesale sale' : byWeight ? 'Amount to sell' : 'Quantity'}
            </h2>
            <p className="mt-1 break-words text-sm leading-snug text-gray-800">{product.name}</p>
            {wholesaleMode ? (
              <p className="mt-2 text-sm text-gray-600">
                Cost: <span className="font-semibold">{formatCurrency(product.buying_price)}</span>
                {' · '}
                Retail: <span className="font-medium">{formatCurrency(product.selling_price)}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm">
                <span className="text-gray-500">{byWeight ? `Price / ${label}` : 'Each'}:</span>{' '}
                <span className="font-semibold text-primary-700">{formatCurrency(product.selling_price)}</span>
              </p>
            )}
          </div>
          <button type="button" className="shrink-0 rounded-lg p-2 hover:bg-gray-100" onClick={onCancel} aria-label="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {wholesaleMode && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <label className="form-label text-violet-900">Markup on cost (%)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                max={500}
                step={1}
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                className="form-input w-24 font-semibold tabular-nums"
              />
              <span className="text-sm text-violet-800">
                → <Currency amount={unitPrice} className="inline text-sm" /> per {label}
              </span>
            </div>
            <p className="mt-2 text-xs text-violet-700">
              Example: cost {formatCurrency(product.buying_price)} + {markup || 0}% = {formatCurrency(unitPrice)}
            </p>
          </div>
        )}

        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {byWeight
            ? `Sold by ${label} — e.g. 0.5, 1, 2.5. Max in stock: ${maxQty} ${label}.`
            : `Whole units only. In stock: ${maxQty}.`}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className="min-h-[40px] min-w-[3.5rem] rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium hover:border-primary-400 hover:bg-primary-50"
              onClick={() => setQty(p)}
            >
              {byWeight ? `${p} ${label}` : `${p}×`}
            </button>
          ))}
        </div>

        <label className="form-label">Enter quantity ({label})</label>
        <input
          type="number"
          min={min}
          step={step}
          value={qty}
          onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
          className="form-input mb-4 text-lg font-semibold tabular-nums"
        />

        <div className="mb-6 rounded-lg bg-gray-50 p-3 text-center">
          <p className="text-xs text-gray-600">Line total</p>
          <Currency amount={lineTotal} className="stat-value-currency text-primary-600" amountClassName="text-primary-600" />
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            onClick={submit}
            disabled={!Number.isFinite(Number(qty)) || Number(qty) < min}
          >
            {wholesaleMode ? 'Add wholesale' : 'Add to cart'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AddQuantityModal;
