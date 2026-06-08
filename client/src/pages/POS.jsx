import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Tag, ClipboardList, RotateCcw, User, ShoppingCart, CreditCard, Package } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { productsAPI, salesAPI, customersAPI } from '../api/client';
import { formatCurrency, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ProductSearch from '../components/pos/ProductSearch';
import Cart from '../components/pos/Cart';
import PaymentModal from '../components/pos/PaymentModal';
import ReceiptModal from '../components/pos/ReceiptModal';
import MoMoAgentSection from '../components/pos/MoMoAgentSection';
import AddQuantityModal, { isSoldByWeight, unitLabel } from '../components/pos/AddQuantityModal';

const POS = () => {
  const { user, hasRole } = useAuthStore();
  const {
    items,
    customer,
    discountAmount,
    discountReason,
    wholesaleMode,
    defaultWholesaleMarkup,
    addItem,
    clearCart,
    setCustomer,
    setWholesaleMode,
    setProcessing,
    getSubtotal,
    getTotal,
    validateCart,
    getCartSummary,
    resetForNextSale,
  } = useCartStore();

  const [barcodePickerProduct, setBarcodePickerProduct] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const barcodeInputRef = useRef(null);

  const focusScan = useCallback(() => {
    barcodeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusScan();
  }, [focusScan]);

  const searchByBarcode = async (barcode) => {
    try {
      const response = await productsAPI.getByBarcode(barcode);
      if (response.data.product) {
        const product = response.data.product;
        if (wholesaleMode && hasRole('admin', 'manager')) {
          setBarcodePickerProduct(product);
        } else {
          addItem(product, 1);
          toast.success(`Added: ${product.name}`);
        }
        setSearchQuery('');
        focusScan();
      }
    } catch {
      toast.error('Product not found for this barcode');
      setSearchQuery('');
      focusScan();
    }
  };

  const handleBarcodeInput = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (/^\d{8,14}$/.test(value)) {
      searchByBarcode(value);
    }
  };

  const handleProductSelect = (product, qty = 1, extras = {}) => {
    if (wholesaleMode && hasRole('admin', 'manager')) {
      const markup = extras.wholesaleMarkupPercent ?? defaultWholesaleMarkup;
      if (!markup || markup <= 0) {
        toast.error('Set a wholesale markup % for this product');
        return;
      }
      addItem(product, qty, { wholesaleMarkupPercent: markup });
    } else {
      addItem(product, qty);
    }
    const suffix = isSoldByWeight(product)
      ? ` (${qty} ${unitLabel(product)})`
      : qty !== 1
        ? ` ×${qty}`
        : '';
    const wholesaleNote =
      wholesaleMode && hasRole('admin', 'manager')
        ? ` @ wholesale +${extras.wholesaleMarkupPercent ?? defaultWholesaleMarkup}%`
        : '';
    toast.success(`Added: ${product.name}${suffix}${wholesaleNote}`);
    setSearchQuery('');
    focusScan();
  };

  const lookupCustomer = async (raw) => {
    const q = String(raw || '').trim();
    if (q.length < 4) {
      setCustomer(null);
      return;
    }
    try {
      const response = await customersAPI.getAll({ search: q, limit: 10 });
      const list = response.data.customers || [];
      if (list.length === 1) {
        setCustomer(list[0]);
        toast.success(`Customer: ${list[0].name}`);
        return;
      }
      const digits = q.replace(/\D/g, '');
      const byPhone = list.find((c) => String(c.phone || '').replace(/\D/g, '').endsWith(digits));
      if (byPhone) {
        setCustomer(byPhone);
        toast.success(`Customer: ${byPhone.name}`);
        return;
      }
      if (list.length > 1) {
        setCustomer(list[0]);
        toast(`Multiple matches — using ${list[0].name}`, { icon: 'ℹ️' });
        return;
      }
      setCustomer(null);
    } catch (err) {
      const { message } = handleApiError(err);
      toast.error(message);
    }
  };

  const handleCheckout = () => {
    const validation = validateCart();
    if (!validation.isValid) {
      toast.error(validation.errors.join(' · '));
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePayment = async (paymentData) => {
    setProcessing(true);
    const summary = getCartSummary();

    try {
      const saleData = {
        items: items.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          ...(item.is_wholesale
            ? {
                unit_price: item.unit_price,
                is_wholesale: true,
                wholesale_markup_percent: item.wholesale_markup_percent,
              }
            : {}),
        })),
        customer_id: customer?.id || null,
        discount_amount: discountAmount,
        discount_reason: discountAmount > 0 ? summary.discountReason || 'Manual discount' : '',
        payment_method: paymentData.method,
        payment_reference: paymentData.reference || null,
        amount_paid: paymentData.amountPaid ?? getTotal(),
        change_given: paymentData.changeGiven ?? 0,
      };

      const response = await salesAPI.create(saleData);
      const data = response.data;

      if (!data?.saleNumber) {
        throw new Error('Invalid response from server');
      }

      setLastSale({
        saleId: data.saleId,
        saleNumber: data.saleNumber,
        totalAmount: data.totalAmount ?? summary.total,
        subtotal: data.subtotal ?? summary.subtotal,
        taxAmount: data.taxAmount ?? summary.taxAmount,
        discountAmount: summary.discountAmount,
        discountReason: summary.discountReason,
        hasWholesaleItems: summary.hasWholesaleItems,
        amountPaid: data.amountPaid ?? paymentData.amountPaid ?? summary.total,
        changeGiven: data.changeGiven ?? paymentData.changeGiven ?? 0,
        paymentMethod: paymentData.method,
        paymentReference: paymentData.reference || '',
        customerName: customer?.name,
        customerPhone: customer?.phone,
        cashierName: user?.name,
        createdAt: new Date().toISOString(),
        items: summary.items.map((it) => ({
          productName: it.name,
          quantity: it.quantity,
          lineTotal: it.line_total,
          isWholesale: it.is_wholesale,
          wholesaleMarkupPercent: it.wholesale_markup_percent,
          unitPrice: it.unit_price,
        })),
      });

      resetForNextSale();
      setShowPaymentModal(false);
      setShowReceiptModal(true);
      toast.success(`Sale ${data.saleNumber} saved`);
      focusScan();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleSendSMSReceipt = async () => {
    if (!lastSale?.saleId) return;
    try {
      await salesAPI.resendReceipt(lastSale.saleId, 'sms');
      toast.success('SMS receipt requested');
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const handleSendWhatsAppReceipt = async () => {
    if (!lastSale?.saleId) return;
    try {
      await salesAPI.resendReceipt(lastSale.saleId, 'whatsapp');
      toast.success('WhatsApp receipt requested');
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (showPaymentModal || showReceiptModal) return;
      if (e.key === 'F2') {
        e.preventDefault();
        focusScan();
      }
      if (e.key === 'F9') {
        e.preventDefault();
        const v = useCartStore.getState().validateCart();
        if (v.isValid) setShowPaymentModal(true);
        else toast.error(v.errors.join(' · '));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPaymentModal, showReceiptModal, focusScan]);

  const subtotal = getSubtotal();
  const total = getTotal();

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 pb-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        {/* Step 1–2: Scan + catalogue */}
        <section className="order-1 space-y-4 lg:col-span-5 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Search className="h-5 w-5 text-primary-600" />
              Scan barcode
            </h2>
            <input
              ref={barcodeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={searchQuery}
              onChange={handleBarcodeInput}
              placeholder="Scanner sends digits here, or type barcode…"
              className="barcode-input w-full rounded-lg border-2 border-gray-200 px-3 py-3 font-mono text-lg focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <ShoppingCart className="h-5 w-5 text-primary-600" />
              Products
            </h2>
            <ProductSearch
              onProductSelect={handleProductSelect}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              wholesaleMode={wholesaleMode && hasRole('admin', 'manager')}
              defaultWholesaleMarkup={defaultWholesaleMarkup}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Quick category filter</h3>
            <div className="flex flex-wrap gap-2">
              {['Food', 'Beverages', 'Bakery', 'Dairy', 'Cleaning', 'Electronics'].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setSearchQuery(category);
                    focusScan();
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:border-primary-400 hover:bg-primary-50"
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Step 3: Cart */}
        <section className="order-2 lg:col-span-4 lg:self-start relative z-10">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <CreditCard className="h-4 w-4 text-primary-600" />
              Cart
            </h2>
            {hasRole('admin', 'manager') && (
              <Button
                type="button"
                size="sm"
                variant={wholesaleMode ? 'primary' : 'secondary'}
                className={wholesaleMode ? 'bg-violet-600 hover:bg-violet-700' : ''}
                onClick={() => {
                  const next = !wholesaleMode;
                  setWholesaleMode(next);
                  toast.success(next ? 'Wholesale mode — set markup per product' : 'Retail mode');
                }}
              >
                <Package className="mr-1.5 h-4 w-4" />
                {wholesaleMode ? 'Wholesale ON' : 'Wholesale'}
              </Button>
            )}
          </div>
          {wholesaleMode && hasRole('admin', 'manager') && (
            <p className="mb-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
              Wholesale mode: each product gets its own markup % on buying price when added.
            </p>
          )}
          <Cart onCheckout={handleCheckout} />
        </section>

        {/* Step 4: Customer + summary */}
        <section className="order-3 space-y-4 lg:col-span-3 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <User className="h-5 w-5 text-primary-600" />
              Customer
            </h3>
            <input
              type="text"
              className="form-input mb-2"
              placeholder="Phone or name — press Enter to search"
              value={customerPhoneInput}
              onChange={(e) => setCustomerPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  lookupCustomer(customerPhoneInput);
                }
              }}
            />
            <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => lookupCustomer(customerPhoneInput)}>
              Look up customer
            </Button>
            {customer ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="font-medium text-blue-900">{customer.name}</p>
                <p className="text-sm text-blue-700">{customer.phone}</p>
                <p className="text-xs text-blue-600">{customer.loyalty_points} loyalty points</p>
                <button type="button" className="mt-2 text-xs text-red-600 hover:underline" onClick={() => setCustomer(null)}>
                  Remove customer
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Order totals</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-red-600">-{formatCurrency(discountAmount)}</span>
                  </div>
                  {discountReason ? <p className="text-xs text-gray-500">{discountReason}</p> : null}
                </>
              ) : null}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold">
                <span>Due</span>
                <span className="text-primary-600">{formatCurrency(total)}</span>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex w-full items-center justify-start gap-2 text-left"
                  onClick={() => useCartStore.getState().setDiscount(0, '')}
                  disabled={discountAmount <= 0}
                >
                  <Tag className="h-4 w-4 shrink-0 text-primary-600" aria-hidden />
                  <span className="min-w-0 leading-snug">Clear discount</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex w-full items-center justify-start gap-2 text-left"
                  onClick={() => {
                    if (window.confirm('Clear all lines? Customer can stay attached.')) {
                      resetForNextSale();
                      toast.success('Cart cleared');
                      focusScan();
                    }
                  }}
                >
                  <ClipboardList className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />
                  <span className="min-w-0 leading-snug">Clear lines only</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex w-full items-center justify-start gap-2 text-left text-red-700"
                  onClick={() => {
                    if (window.confirm('Clear cart and customer?')) {
                      clearCart();
                      setWholesaleMode(false);
                      setCustomerPhoneInput('');
                      toast.success('Cart reset');
                      focusScan();
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 leading-snug">Full reset</span>
                </Button>
              </div>
            </div>
          </div>

        </section>

        <section className="order-4 lg:col-span-12 lg:col-start-1">
          <MoMoAgentSection embedded defaultExpanded={false} />
        </section>
      </div>

      {barcodePickerProduct && (
        <AddQuantityModal
          product={barcodePickerProduct}
          wholesaleMode
          defaultMarkupPercent={defaultWholesaleMarkup}
          onConfirm={(qty, extras) => {
            handleProductSelect(barcodePickerProduct, qty, extras);
            setBarcodePickerProduct(null);
          }}
          onCancel={() => setBarcodePickerProduct(null)}
        />
      )}

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="" size="lg" showCloseButton={false}>
        <PaymentModal
          totalAmount={getTotal()}
          customer={customer}
          paymentMethods={
            user?.payment_methods || { cash: true, mtn_momo: false, airtel_money: false }
          }
          onPayment={handlePayment}
          onCancel={() => setShowPaymentModal(false)}
        />
      </Modal>

      <Modal isOpen={showReceiptModal} onClose={() => setShowReceiptModal(false)} title="" size="md" showCloseButton={false}>
        <ReceiptModal
          sale={lastSale}
          onPrint={handlePrintReceipt}
          onSendSMS={handleSendSMSReceipt}
          onSendWhatsApp={handleSendWhatsAppReceipt}
          onClose={() => {
            setShowReceiptModal(false);
            setLastSale(null);
            focusScan();
          }}
        />
      </Modal>
    </div>
  );
};

export default POS;
