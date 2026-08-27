import React, { useState } from 'react';
import { X, Printer, Smartphone, MessageCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { storeReceiptBranding } from '../../utils/storeBrand';
import { sendWhatsAppReceipt } from '../../utils/whatsappReceipt';
import Button from '../ui/Button';
import { toast } from 'react-hot-toast';

/**
 * Receipt summary — render inside parent <Modal> only.
 */
const ReceiptModal = ({ sale, onClose, onPrint, onSendSMS }) => {
  const user = useAuthStore((s) => s.user);
  const { name: storeName, code: storeCode } = storeReceiptBranding(user);
  const [waPhone, setWaPhone] = useState('');

  if (!sale) return null;

  const items = (sale.items || []).map((item) => ({
    label: item.productName || item.name,
    qty: item.quantity,
    line: item.lineTotal ?? item.line_total ?? 0,
    wholesale: item.isWholesale,
    markup: item.wholesaleMarkupPercent,
  }));

  const payLabel = (sale.paymentMethod || 'cash').replace(/_/g, ' ');

  const handleWhatsApp = () => {
    let phone = sale.customerPhone || waPhone.trim();
    if (!phone) {
      phone = window.prompt('Customer WhatsApp number (e.g. 0756123456):', '') || '';
      if (!phone.trim()) return;
    }
    try {
      sendWhatsAppReceipt(phone, sale, storeName, storeCode);
      toast.success('Opening WhatsApp — tap Send to deliver the receipt');
    } catch (err) {
      toast.error(err.message || 'Could not open WhatsApp');
    }
  };

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
                {row.wholesale && row.markup ? (
                  <span className="text-[10px] text-violet-700"> (W/S +{row.markup}%)</span>
                ) : null}
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
              <div className="space-y-0.5 text-red-600">
                <div className="flex justify-between">
                  <span>
                    Discount
                    {sale.hasWholesaleItems ? ' (excl. wholesale lines)' : ''}
                  </span>
                  <span>-{formatCurrency(sale.discountAmount)}</span>
                </div>
                {sale.discountReason ? (
                  <p className="text-xs text-gray-600">{sale.discountReason}</p>
                ) : null}
              </div>
            )}
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
            {(sale.balanceDue || 0) > 0 && (
              <>
                <div className="flex justify-between font-semibold text-violet-800">
                  <span>Balance due (credit)</span>
                  <span>{formatCurrency(sale.balanceDue)}</span>
                </div>
                {sale.creditDueDate && (
                  <div className="flex justify-between text-xs text-violet-700">
                    <span>Due date</span>
                    <span>{sale.creditDueDate}</span>
                  </div>
                )}
              </>
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

      {!sale.customerPhone && (
        <div>
          <label className="form-label text-sm">WhatsApp number (if not on customer record)</label>
          <input
            type="tel"
            className="form-input"
            placeholder="0756123456"
            value={waPhone}
            onChange={(e) => setWaPhone(e.target.value)}
          />
        </div>
      )}

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
          onClick={handleWhatsApp}
          className="flex items-center justify-center gap-2 border-green-300 text-green-800 hover:bg-green-50"
        >
          <Smartphone className="h-4 w-4" />
          WhatsApp
        </Button>
        <Button variant="secondary" type="button" onClick={onClose} className="flex items-center justify-center gap-2">
          <X className="h-4 w-4" />
          Next customer
        </Button>
      </div>
      <p className="text-xs text-center text-gray-500">
        WhatsApp opens with the receipt pre-filled — tap Send on your phone. No API setup required.
      </p>
    </div>
  );
};

export default ReceiptModal;
