import { create } from 'zustand';
import { roundUgx, computeSaleTotals } from '../utils/money';

export const WHOLESALE_REASON_PREFIX = 'Wholesale';

export function wholesaleDiscountReason(percent) {
  const p = Math.round(Number(percent) || 0);
  return `${WHOLESALE_REASON_PREFIX} (${p}% off)`;
}

export function calcWholesaleDiscount(subtotal, percent) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return roundUgx((Number(subtotal) || 0) * (p / 100));
}

function recalcWholesaleDiscount(state) {
  if (!state.isWholesale || !(Number(state.wholesalePercent) > 0)) {
    return null;
  }
  const subtotal = roundUgx(
    state.items.reduce((sum, item) => sum + item.line_total, 0)
  );
  return {
    discountAmount: calcWholesaleDiscount(subtotal, state.wholesalePercent),
    discountReason: wholesaleDiscountReason(state.wholesalePercent),
  };
}

const useCartStore = create((set, get) => ({
  // State
  items: [],
  customer: null,
  discountAmount: 0,
  discountReason: '',
  isWholesale: false,
  wholesalePercent: 0,
  paymentMethod: 'cash',
  paymentReference: '',
  isProcessing: false,

  // Actions
  addItem: (product, quantity = 1) => {
    const items = get().items;
    const existingItem = items.find(item => item.id === product.id);
    
    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      const updatedItems = items.map((item) =>
        item.id === product.id
          ? { ...item, quantity: newQty, line_total: roundUgx(item.unit_price * newQty) }
          : item
      );
      const next = { items: updatedItems };
      const wholesalePatch = recalcWholesaleDiscount({ ...get(), ...next });
      set(wholesalePatch ? { ...next, ...wholesalePatch } : next);
      return;
    } else {
      // Add new item
      const newItem = {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        sku: product.sku,
        category: product.category,
        unit: product.unit,
        unit_price: product.selling_price,
        buying_price: product.buying_price,
        quantity,
        line_total: roundUgx(product.selling_price * quantity)
      };
      const next = { items: [...items, newItem] };
      const wholesalePatch = recalcWholesaleDiscount({ ...get(), ...next });
      set(wholesalePatch ? { ...next, ...wholesalePatch } : next);
    }
  },

  removeItem: (productId) => {
    const items = get().items.filter(item => item.id !== productId);
    const next = { items };
    const wholesalePatch = recalcWholesaleDiscount({ ...get(), ...next });
    set(wholesalePatch ? { ...next, ...wholesalePatch } : next);
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }

    const items = get().items.map(item =>
      item.id === productId
        ? { ...item, quantity, line_total: roundUgx(item.unit_price * quantity) }
        : item
    );
    const next = { items };
    const wholesalePatch = recalcWholesaleDiscount({ ...get(), ...next });
    set(wholesalePatch ? { ...next, ...wholesalePatch } : next);
  },

  setQuantity: (productId, quantity) => {
    const items = get().items.map(item =>
      item.id === productId
        ? { ...item, quantity, line_total: roundUgx(item.unit_price * quantity) }
        : item
    );
    const next = { items };
    const wholesalePatch = recalcWholesaleDiscount({ ...get(), ...next });
    set(wholesalePatch ? { ...next, ...wholesalePatch } : next);
  },

  clearCart: () => {
    set({
      items: [],
      customer: null,
      discountAmount: 0,
      discountReason: '',
      isWholesale: false,
      wholesalePercent: 0,
      paymentMethod: 'cash',
      paymentReference: '',
    });
  },

  /** Clear line items and discount after a completed sale; keep customer for the next basket. */
  resetForNextSale: () => {
    set({
      items: [],
      discountAmount: 0,
      discountReason: '',
      isWholesale: false,
      wholesalePercent: 0,
      paymentMethod: 'cash',
      paymentReference: '',
      isProcessing: false,
    });
  },

  setCustomer: (customer) => {
    set({ customer });
  },

  setDiscount: (amount, reason = '') => {
    set({
      discountAmount: amount || 0,
      discountReason: reason,
      isWholesale: false,
      wholesalePercent: 0,
    });
  },

  setWholesale: (percent) => {
    const p = Math.min(100, Math.max(0, Number(percent) || 0));
    if (p <= 0) {
      set({
        isWholesale: false,
        wholesalePercent: 0,
        discountAmount: 0,
        discountReason: '',
      });
      return;
    }
    const subtotal = get().getSubtotal();
    set({
      isWholesale: true,
      wholesalePercent: p,
      discountAmount: calcWholesaleDiscount(subtotal, p),
      discountReason: wholesaleDiscountReason(p),
    });
  },

  clearWholesale: () => {
    set({
      isWholesale: false,
      wholesalePercent: 0,
      discountAmount: 0,
      discountReason: '',
    });
  },

  setPaymentMethod: (method) => {
    set({ paymentMethod: method });
  },

  setPaymentReference: (reference) => {
    set({ paymentReference: reference });
  },

  setProcessing: (processing) => {
    set({ isProcessing: processing });
  },

  // Getters
  getSubtotal: () => {
    const items = get().items;
    return roundUgx(items.reduce((sum, item) => sum + item.line_total, 0));
  },

  getTaxAmount: () => {
    const { taxAmount } = computeSaleTotals(get().getSubtotal(), get().discountAmount);
    return taxAmount;
  },

  getTotal: () => {
    const { total } = computeSaleTotals(get().getSubtotal(), get().discountAmount);
    return total;
  },

  getItemCount: () => {
    const items = get().items;
    return items.reduce((sum, item) => sum + item.quantity, 0);
  },

  getTotalProfit: () => {
    const items = get().items;
    return items.reduce((sum, item) => {
      const itemProfit = (item.unit_price - item.buying_price) * item.quantity;
      return sum + itemProfit;
    }, 0);
  },

  getItemsByCategory: () => {
    const items = get().items;
    const grouped = {};
    
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });
    
    return grouped;
  },

  // Validation
  validateCart: () => {
    const items = get().items;
    const errors = [];
    
    // Check if all items have positive quantity
    items.forEach(item => {
      if (item.quantity <= 0) {
        errors.push(`${item.name}: Quantity must be greater than 0`);
      }
    });
    
    // Check if cart is empty
    if (items.length === 0) {
      errors.push('Cart is empty');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Apply loyalty points
  applyLoyaltyPoints: (points) => {
    const subtotal = get().getSubtotal();
    const pointValue = 10; // 1 point = UGX 10
    const maxDiscount = points * pointValue;
    const discountAmount = Math.min(maxDiscount, subtotal);
    
    set({
      discountAmount,
      discountReason: `Redeemed ${points} loyalty points`,
      isWholesale: false,
      wholesalePercent: 0,
    });
    
    return discountAmount;
  },

  // Get cart summary for receipt
  getCartSummary: () => {
    const items = get().items;
    const discountAmount = roundUgx(get().discountAmount);
    const { subtotal, taxAmount, total } = computeSaleTotals(
      items.reduce((s, i) => s + i.line_total, 0),
      discountAmount
    );
    const itemCount = get().getItemCount();
    const totalProfit = get().getTotalProfit();
    
    return {
      items,
      subtotal,
      discountAmount,
      discountReason: get().discountReason,
      isWholesale: get().isWholesale,
      wholesalePercent: get().wholesalePercent,
      taxAmount,
      total,
      itemCount,
      totalProfit,
      customer: get().customer,
      paymentMethod: get().paymentMethod,
      paymentReference: get().paymentReference,
    };
  },

  // Check stock availability
  checkStockAvailability: (stockData) => {
    const items = get().items;
    const unavailable = [];
    
    items.forEach(item => {
      const availableStock = stockData[item.id] || 0;
      if (item.quantity > availableStock) {
        unavailable.push({
          ...item,
          availableStock,
          requestedQuantity: item.quantity
        });
      }
    });
    
    return {
      isAvailable: unavailable.length === 0,
      unavailable
    };
  }
}));

export { useCartStore };
