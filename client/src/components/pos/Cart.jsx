import React, { useState } from 'react';
import { Minus, Plus, X, Trash2 } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../api/client';
import { quantityStepForUnit, quantityMinForUnit } from './AddQuantityModal';

const Cart = ({ onCheckout }) => {
  const { hasRole } = useAuthStore();
  const canManageWholesale = hasRole('admin', 'manager');
  const [editingMarkupId, setEditingMarkupId] = useState(null);
  const [markupDraft, setMarkupDraft] = useState('');

  const {
    items,
    customer,
    discountAmount,
    discountReason,
    getSubtotal,
    getTotal,
    getItemCount,
    removeItem,
    updateQuantity,
    setItemWholesaleMarkup,
    clearCart,
    isProcessing,
  } = useCartStore();

  const handleQuantityChange = (productId, direction) => {
    const item = items.find((i) => i.id === productId);
    if (!item) return;
    const step = quantityStepForUnit(item.unit);
    const min = quantityMinForUnit(item.unit);
    const raw = item.quantity + direction * step;
    const decimals = step < 1 ? 3 : 0;
    const newQuantity = Math.round(raw / step) * step;
    const rounded = Number(newQuantity.toFixed(decimals));
    if (rounded < min - 1e-9) {
      removeItem(productId);
      return;
    }
    updateQuantity(productId, Math.max(min, rounded));
  };

  const startEditMarkup = (item) => {
    setEditingMarkupId(item.id);
    setMarkupDraft(String(item.wholesale_markup_percent || ''));
  };

  const saveMarkup = (productId) => {
    const pct = Number(markupDraft);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 500) return;
    setItemWholesaleMarkup(productId, pct);
    setEditingMarkupId(null);
    setMarkupDraft('');
  };

  const subtotal = getSubtotal();
  const total = getTotal();
  const itemCount = getItemCount();

  return (
    <div className="bg-white rounded-xl shadow-sm h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Shopping Cart</h2>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to clear the entire cart?')) clearCart();
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Clear Cart"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>

        {customer ? (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-800">Customer: {customer.name}</p>
            <p className="text-xs text-blue-600">{customer.loyalty_points} points available</p>
          </div>
        ) : (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">No customer selected</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">Your cart is empty</p>
            <p className="text-sm text-gray-400">Add products to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                      {item.is_wholesale ? (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                          Wholesale +{item.wholesale_markup_percent}%
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500">
                      {item.sku && `SKU: ${item.sku} • `}
                      {item.barcode && `Barcode: ${item.barcode}`}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                    title="Remove item"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                <div className="mt-1 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.id, -1)}
                        className="rounded p-1.5 hover:bg-gray-100"
                        title="Decrease"
                      >
                        <Minus className="h-4 w-4 text-gray-600" />
                      </button>
                      <input
                        type="number"
                        min={quantityMinForUnit(item.unit)}
                        step={quantityStepForUnit(item.unit)}
                        value={item.quantity}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isNaN(v) && v > 0) updateQuantity(item.id, v);
                        }}
                        className="w-16 border-0 bg-transparent text-center text-sm font-semibold focus:ring-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="rounded p-1.5 hover:bg-gray-100"
                        title="Increase"
                      >
                        <Plus className="h-4 w-4 text-gray-600" />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">Unit ({item.unit || 'piece'})</p>
                      <p className="whitespace-nowrap font-medium tabular-nums">{formatCurrency(item.unit_price)}</p>
                      {item.is_wholesale && item.retail_unit_price > item.unit_price ? (
                        <p className="text-[10px] text-gray-400 line-through">
                          Retail {formatCurrency(item.retail_unit_price)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {canManageWholesale && item.is_wholesale && (
                    <div className="w-full sm:w-auto">
                      {editingMarkupId === item.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={markupDraft}
                            onChange={(e) => setMarkupDraft(e.target.value)}
                            className="form-input w-16 py-1 text-xs"
                          />
                          <span className="text-xs text-gray-500">%</span>
                          <button
                            type="button"
                            className="rounded bg-violet-600 px-2 py-1 text-xs text-white"
                            onClick={() => saveMarkup(item.id)}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-violet-700 hover:underline"
                          onClick={() => startEditMarkup(item)}
                        >
                          Edit markup %
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex shrink-0 flex-col border-t border-gray-100 pt-2 text-left sm:border-t-0 sm:pt-0 sm:text-right">
                    <p className="text-xs text-gray-500">Line total</p>
                    <p className="whitespace-nowrap text-lg font-semibold tabular-nums text-gray-900">
                      {formatCurrency(item.line_total)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Items ({itemCount}):</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-sm text-red-600">Discount:</span>
                <span className="font-medium text-red-600">-{formatCurrency(discountAmount)}</span>
              </div>
              {discountReason ? <p className="text-xs text-gray-500">{discountReason}</p> : null}
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-gray-300">
            <span className="text-lg font-bold text-gray-900">Total:</span>
            <span className="text-xl font-bold text-primary-600">{formatCurrency(total)}</span>
          </div>
        </div>

        <button
          onClick={onCheckout}
          disabled={items.length === 0 || isProcessing}
          className="w-full btn btn-primary btn-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Processing Payment...
            </div>
          ) : (
            <>
              Proceed to Checkout
              <div className="text-sm opacity-75">{formatCurrency(total)}</div>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Cart;
