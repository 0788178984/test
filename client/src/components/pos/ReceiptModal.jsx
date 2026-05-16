import React from 'react';
import { X, Printer, Smartphone, MessageCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { storeReceiptBranding } from '../../utils/storeBrand';
import Button from '../ui/Button';

/**
 * Receipt summary — render inside parent <Modal> only.
 */
const ReceiptModal = ({ sale, onClose, onPrint, onSendSMS, onSendWhatsApp }) => {
  const user = useAuthStore((s) => s.user);
  const { name: storeName, code: storeCode } = storeReceiptBranding(user);

  if (!sale) return null;

  const items = (sale.items || []).map((item) => ({
    label: item.productName || item.name,
    qty: item.quantity,
    line: item.lineTotal ?? item.line_total ?? 0,
  }));

  const payLabel = (sale.paymentMethod || 'cash').replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Sale complete</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="receipt rounded-lg bg-white p-6 shadow-inner">
        <div className="receipt-header mb-4 text-center">
          <h1 className="text-lg font-bold">{storeName}</h1>
          {storeCode ? (
            <p className="text-base font-semibold tracking-wide text-gray-800">Code: {storeCode}</p>
          ) : null}
        </div>

        <div className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span>Receipt</span>
            <span className="font-mono">{sale.saleNumber}</span>
          </div>
          {sale.createdAt && (
            <div className="flex justify-between gap-2 text-gray-600">
              <span>Time</span>
              <span>{formatDate(sale.createdAt, { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          {sale.cashierName && (
            <div className="flex justify-between gap-2">
              <span>Cashier</span>
              <span>{sale.cashierName}</span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span>Customer</span>
            <span>{sale.customerName || 'Walk-in'}</span>
          </div>
        </div>

        <div className="border-t-2 border-gray-800 pt-3">
          {items.map((row, index) => (
            <div key={index} className="receipt-item flex justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {row.label} ×{row.qty}
              </span>
              <span>{formatCurrency(row.line)}</span>
            </div>
          ))}

          <div className="mt-3 space-y-1 border-t border-gray-300 pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal ?? 0)}</span>
            </div>
            {(sale.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount</span>
                <span>-{formatCurrency(sale.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>VAT (18%)</span>
              <span>{formatCurrency(sale.taxAmount ?? 0)}</span>
            </div>
            <div className="receipt-total flex justify-between text-base font-bold">
              <span>TOTAL</span>
              <span>{formatCurrency(sale.totalAmount ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Paid ({payLabel})</span>
              <span>{formatCurrency(sale.amountPaid ?? sale.totalAmount ?? 0)}</span>
            </div>
            {(sale.changeGiven || 0) > 0 && (
              <div className="flex justify-between text-primary-700">
                <span>Change</span>
                <span>{formatCurrency(sale.changeGiven)}</span>
              </div>
            )}
            {sale.paymentReference && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Ref</span>
                <span className="font-mono">{sale.paymentReference}</span>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">Thank you — come again!</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button variant="primary" type="button" onClick={() => onPrint?.()} className="flex items-center justify-center gap-2">
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => onSendSMS?.()}
          disabled={!sale.customerPhone}
          className="flex items-center justify-center gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          SMS receipt
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => onSendWhatsApp?.()}
          disabled={!sale.customerPhone}
          className="flex items-center justify-center gap-2"
        >
          <Smartphone className="h-4 w-4" />
          WhatsApp
        </Button>
        <Button variant="secondary" type="button" onClick={onClose} className="flex items-center justify-center gap-2">
          <X className="h-4 w-4" />
          Next customer
        </Button>
      </div>
    </div>
  );
};

export default ReceiptModal;
