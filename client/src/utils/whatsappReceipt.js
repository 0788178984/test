/** Digits only for wa.me (256XXXXXXXXX). */
export function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('256') && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith('0') && digits.length >= 10) return `256${digits.slice(1, 10)}`;
  if (digits.length >= 9) return `256${digits.slice(-9)}`;
  return digits;
}

function formatUgx(amount) {
  return Math.round(Number(amount) || 0).toLocaleString('en-UG');
}

function formatReceiptDate(iso) {
  if (!iso) return new Date().toLocaleString('en-UG');
  try {
    return new Date(iso).toLocaleString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function buildWhatsAppReceiptMessage(sale, storeName, storeCode) {
  const items = (sale.items || [])
    .map((item) => {
      const name = item.productName || item.name || 'Item';
      const qty = item.qty ?? item.quantity ?? 1;
      const line = item.line ?? item.lineTotal ?? item.line_total ?? 0;
      return `• ${name} ×${qty} — USh ${formatUgx(line)}`;
    })
    .join('\n');

  const total = formatUgx(sale.totalAmount ?? sale.total_amount ?? 0);
  const balance = Number(sale.balanceDue ?? sale.balance_due ?? 0);
  const codeLine = storeCode ? `*Code: ${storeCode}*\n` : '';

  let paymentFooter = '✅ FULLY PAID';
  if (balance > 0) {
    paymentFooter = `💳 Balance Due: USh ${formatUgx(balance)}`;
    const due = sale.creditDueDate || sale.credit_due_date;
    if (due) paymentFooter += `\n📅 Due: ${due}`;
  }

  return `🏥 *${storeName}*
${codeLine}
Receipt: ${sale.saleNumber || sale.sale_number || '—'}
Date: ${formatReceiptDate(sale.createdAt || sale.created_at)}
Cashier: ${sale.cashierName || sale.cashier_name || '—'}
Customer: ${sale.customerName || sale.customer_name || 'Walk-in'}

*Items:*
${items || '—'}

*TOTAL: USh ${total}*
${paymentFooter}

_Thank you — come again!_ 🙏`;
}

/**
 * Opens WhatsApp with a pre-filled receipt — cashier taps Send.
 * @returns {boolean} true if window opened
 */
export function sendWhatsAppReceipt(customerPhone, sale, storeName, storeCode) {
  const phone = normalizeWhatsAppPhone(customerPhone);
  if (!phone || phone.length < 12) {
    throw new Error('Enter a valid Uganda phone number (e.g. 0756123456).');
  }

  const message = buildWhatsAppReceiptMessage(sale, storeName, storeCode);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = url;
  }
  return true;
}
