import { create } from 'zustand';
import { roundUgx, computeSaleTotals, calcWholesaleUnitPrice } from '../utils/money';

function buildLinePricing(product, wholesaleMarkupPercent) {
  const retailPrice = roundUgx(product.selling_price);
  const buyPrice = roundUgx(product.buying_price);
  const markup = Number(wholesaleMarkupPercent);

  if (Number.isFinite(markup) && markup > 0) {
    const unitPrice = calcWholesaleUnitPrice(buyPrice, markup);
    return {
      unit_price: unitPrice,
      retail_unit_price: retailPrice,
      buying_price: buyPrice,
      is_wholesale: true,
      wholesale_markup_percent: markup,
    };
  }

  return {
    unit_price: retailPrice,
    retail_unit_price: retailPrice,
    buying_price: buyPrice,
    is_wholesale: false,
    wholesale_markup_percent: 0,
  };
}

const useCartStore = create((set, get) => ({
  items: [],
  customer: null,
  discountAmount: 0,
  discountReason: '',
  wholesaleMode: false,
  defaultWholesaleMarkup: 10,
  paymentMethod: 'cash',
  paymentReference: '',
  isProcessing: false,

  toggleWholesaleMode: () => {
    set((state) => ({ wholesaleMode: !state.wholesaleMode }));
  },

  setWholesaleMode: (enabled) => {
    set({ wholesaleMode: Boolean(enabled) });
  },

  setDefaultWholesaleMarkup: (percent) => {
    const p = Math.min(500, Math.max(0, Number(percent) || 0));
    set({ defaultWholesaleMarkup: p });
  },

  addItem: (product, quantity = 1, options = {}) => {
    const markup =
      options.wholesaleMarkupPercent != null
        ? options.wholesaleMarkupPercent
        : get().wholesaleMode
          ? get().defaultWholesaleMarkup
          : null;

    const pricing = buildLinePricing(product, markup);
    const items = get().items;
    const existingItem = items.find((item) => item.id === product.id);

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      const mergedPricing =
        pricing.is_wholesale || existingItem.is_wholesale
          ? buildLinePricing(
              {
                selling_price: existingItem.retail_unit_price ?? product.selling_price,
                buying_price: existingItem.buying_price ?? product.buying_price,
              },
              pricing.is_wholesale ? pricing.wholesale_markup_percent : existingItem.wholesale_markup_percent
            )
          : pricing;

      const updatedItems = items.map((item) =>
        item.id === product.id
          ? {
              ...item,
              ...mergedPricing,
              quantity: newQty,
              line_total: roundUgx(mergedPricing.unit_price * newQty),
            }
          : item
      );

      const patch = { items: updatedItems };
      if (pricing.is_wholesale) {
        patch.defaultWholesaleMarkup = pricing.wholesale_markup_percent;
      }
      set(patch);
      return;
    }

    const newItem = {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      quantity,
      line_total: roundUgx(pricing.unit_price * quantity),
      ...pricing,
    };

    const patch = { items: [...items, newItem] };
    if (pricing.is_wholesale) {
      patch.defaultWholesaleMarkup = pricing.wholesale_markup_percent;
    }
    set(patch);
  },

  setItemWholesaleMarkup: (productId, markupPercent) => {
    const pct = Number(markupPercent);
    const items = get().items.map((item) => {
      if (item.id !== productId) return item;
      if (!pct || pct <= 0) {
        const retail = item.retail_unit_price ?? item.unit_price;
        return {
          ...item,
          is_wholesale: false,
          wholesale_markup_percent: 0,
          unit_price: retail,
          line_total: roundUgx(retail * item.quantity),
        };
      }
      const pricing = buildLinePricing(
        {
          selling_price: item.retail_unit_price ?? item.unit_price,
          buying_price: item.buying_price,
        },
        pct
      );
      return {
        ...item,
        ...pricing,
        line_total: roundUgx(pricing.unit_price * item.quantity),
      };
    });
    set({
      items,
      defaultWholesaleMarkup: pct > 0 ? pct : get().defaultWholesaleMarkup,
    });
  },

  removeItem: (productId) => {
    set({ items: get().items.filter((item) => item.id !== productId) });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }

    set({
      items: get().items.map((item) =>
        item.id === productId
          ? { ...item, quantity, line_total: roundUgx(item.unit_price * quantity) }
          : item
      ),
    });
  },

  setQuantity: (productId, quantity) => {
    get().updateQuantity(productId, quantity);
  },

  clearCart: () => {
    set({
      items: [],
      customer: null,
      discountAmount: 0,
      discountReason: '',
      wholesaleMode: false,
      paymentMethod: 'cash',
      paymentReference: '',
    });
  },

  resetForNextSale: () => {
    set({
      items: [],
      discountAmount: 0,
      discountReason: '',
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

  getSubtotal: () => {
    return roundUgx(get().items.reduce((sum, item) => sum + item.line_total, 0));
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
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },

  getTotalProfit: () => {
    return get().items.reduce((sum, item) => {
      return sum + (item.unit_price - item.buying_price) * item.quantity;
    }, 0);
  },

  getItemsByCategory: () => {
    const grouped = {};
    get().items.forEach((item) => {
      const category = item.category || 'Uncategorized';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    });
    return grouped;
  },

  validateCart: () => {
    const items = get().items;
    const errors = [];

    items.forEach((item) => {
      if (item.quantity <= 0) {
        errors.push(`${item.name}: Quantity must be greater than 0`);
      }
      if (item.is_wholesale && item.unit_price < item.buying_price) {
        errors.push(`${item.name}: Wholesale price cannot be below cost`);
      }
    });

    if (items.length === 0) {
      errors.push('Cart is empty');
    }

    return { isValid: errors.length === 0, errors };
  },

  applyLoyaltyPoints: (points) => {
    const subtotal = get().getSubtotal();
    const pointValue = 10;
    const maxDiscount = points * pointValue;
    const discountAmount = Math.min(maxDiscount, subtotal);

    set({
      discountAmount,
      discountReason: `Redeemed ${points} loyalty points`,
    });

    return discountAmount;
  },

  getCartSummary: () => {
    const items = get().items;
    const discountAmount = roundUgx(get().discountAmount);
    const { subtotal, taxAmount, total } = computeSaleTotals(
      items.reduce((s, i) => s + i.line_total, 0),
      discountAmount
    );

    return {
      items,
      subtotal,
      discountAmount,
      discountReason: get().discountReason,
      wholesaleMode: get().wholesaleMode,
      hasWholesaleItems: items.some((i) => i.is_wholesale),
      taxAmount,
      total,
      itemCount: get().getItemCount(),
      totalProfit: get().getTotalProfit(),
      customer: get().customer,
      paymentMethod: get().paymentMethod,
      paymentReference: get().paymentReference,
    };
  },

  checkStockAvailability: (stockData) => {
    const unavailable = [];
    get().items.forEach((item) => {
      const availableStock = stockData[item.id] || 0;
      if (item.quantity > availableStock) {
        unavailable.push({
          ...item,
          availableStock,
          requestedQuantity: item.quantity,
        });
      }
    });
    return { isAvailable: unavailable.length === 0, unavailable };
  },
}));

export { useCartStore };
