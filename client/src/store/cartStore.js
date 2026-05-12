import { create } from 'zustand';

const useCartStore = create((set, get) => ({
  // State
  items: [],
  customer: null,
  discountAmount: 0,
  discountReason: '',
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
          ? { ...item, quantity: newQty, line_total: item.unit_price * newQty }
          : item
      );
      set({ items: updatedItems });
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
        line_total: product.selling_price * quantity
      };
      set({ items: [...items, newItem] });
    }
  },

  removeItem: (productId) => {
    const items = get().items.filter(item => item.id !== productId);
    set({ items });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }

    const items = get().items.map(item =>
      item.id === productId
        ? { ...item, quantity, line_total: item.unit_price * quantity }
        : item
    );
    set({ items });
  },

  setQuantity: (productId, quantity) => {
    const items = get().items.map(item =>
      item.id === productId
        ? { ...item, quantity, line_total: item.unit_price * quantity }
        : item
    );
    set({ items });
  },

  clearCart: () => {
    set({
      items: [],
      customer: null,
      discountAmount: 0,
      discountReason: '',
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
      discountReason: reason 
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
    return items.reduce((sum, item) => sum + item.line_total, 0);
  },

  getTaxAmount: () => {
    const subtotal = get().getSubtotal();
    const discountAmount = get().discountAmount;
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    return taxableAmount * 0.18; // 18% VAT
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const discountAmount = get().discountAmount;
    const taxAmount = get().getTaxAmount();
    return Math.max(0, subtotal - discountAmount + taxAmount);
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
      discountReason: `Redeemed ${points} loyalty points` 
    });
    
    return discountAmount;
  },

  // Get cart summary for receipt
  getCartSummary: () => {
    const items = get().items;
    const subtotal = get().getSubtotal();
    const discountAmount = get().discountAmount;
    const taxAmount = get().getTaxAmount();
    const total = get().getTotal();
    const itemCount = get().getItemCount();
    const totalProfit = get().getTotalProfit();
    
    return {
      items,
      subtotal,
      discountAmount,
      discountReason: get().discountReason,
      taxAmount,
      total,
      itemCount,
      totalProfit,
      customer: get().customer,
      paymentMethod: get().paymentMethod,
      paymentReference: get().paymentReference
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
