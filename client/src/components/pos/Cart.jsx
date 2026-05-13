import React from 'react';
import { Minus, Plus, X, Trash2 } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { formatCurrency } from '../../api/client';
import { quantityStepForUnit, quantityMinForUnit } from './AddQuantityModal';

const Cart = ({ onCheckout }) => {
  const {
    items,
    customer,
    discountAmount,
    getSubtotal,
    getTaxAmount,
    getTotal,
    getItemCount,
    removeItem,
    updateQuantity,
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

  const handleRemoveItem = (productId) => {
    removeItem(productId);
  };

  const handleClearCart = () => {
    if (window.confirm('Are you sure you want to clear the entire cart?')) {
      clearCart();
    }
  };

  const subtotal = getSubtotal();
  const taxAmount = getTaxAmount();
  const total = getTotal();
  const itemCount = getItemCount();

  return (
    <div className="bg-white rounded-xl shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Shopping Cart</h2>
          <button
            onClick={handleClearCart}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Clear Cart"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
        
        {/* Customer Info */}
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

      {/* Cart Items */}
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
                {/* Item Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                    <p className="text-xs text-gray-500">
                      {item.sku && `SKU: ${item.sku} • `}
                      {item.barcode && `Barcode: ${item.barcode}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                    title="Remove item"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                {/* Item Details — stack on narrow screens so prices are not cut off */}
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
                          if (!Number.isNaN(v) && v > 0) {
                            updateQuantity(item.id, v);
                          }
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
                    </div>
                  </div>
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

      {/* Cart Summary */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="space-y-2">
          {/* Items Count */}
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Items ({itemCount}):</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>

          {/* Discount */}
          {discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-sm text-red-600">Discount:</span>
              <span className="font-medium text-red-600">
                -{formatCurrency(discountAmount)}
              </span>
            </div>
          )}

          {/* Tax */}
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Tax (18%):</span>
            <span className="font-medium">{formatCurrency(taxAmount)}</span>
          </div>

          {/* Total */}
          <div className="flex justify-between pt-2 border-t border-gray-300">
            <span className="text-lg font-bold text-gray-900">Total:</span>
            <span className="text-xl font-bold text-primary-600">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* Checkout Button */}
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
              <div className="text-sm opacity-75">
                {formatCurrency(total)}
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Cart;
