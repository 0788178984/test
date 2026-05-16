const escpos = require('escpos');
const escposUSB = require('escpos-usb');
const db = require('../db/connection');

class PrintService {
  constructor() {
    this.device = null;
    this.printer = null;
    this.defaultPrinter = null;
    this.initialize();
  }

  async initialize() {
    try {
      // Try to find USB thermal printer
      const devices = await this.findPrinters();
      
      if (devices.length > 0) {
        this.device = new escposUSB.Device(devices[0]);
        this.printer = new escpos.Printer(this.device);
        this.defaultPrinter = devices[0];
        console.log('Thermal printer found and initialized:', devices[0].deviceName);
      } else {
        console.log('No thermal printer found, will use browser print fallback');
      }
    } catch (error) {
      console.error('Failed to initialize printer:', error);
    }
  }

  async findPrinters() {
    try {
      return escposUSB.findPrinter();
    } catch (error) {
      console.error('Error finding printers:', error);
      return [];
    }
  }

  async printReceipt(saleId, options = {}) {
    try {
      const sale = await db.prepare(`
        SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone
        FROM sales s
        LEFT JOIN users u ON s.cashier_id = u.id
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.id = ? AND s.deleted_at IS NULL
      `).get(saleId);

      if (!sale) {
        throw new Error('Sale not found');
      }

      const items = await db.prepare(`
        SELECT product_name, quantity, unit_price, line_total
        FROM sale_items
        WHERE sale_id = ?
      `).all(saleId);

      const branding = await this.getBusinessBranding(sale.business_id);
      const storeAddress = await this.getStoreAddress();
      const storePhone = await this.getStorePhone();
      const storeTin = await this.getStoreTin();

      if (this.printer) {
        // Use thermal printer
        await this.printThermalReceipt({
          sale,
          items,
          storeName: branding.displayName,
          storeCode: branding.businessCode,
          storeAddress,
          storePhone,
          storeTin,
          ...options
        });
      } else {
        // Fallback to browser print
        return {
          success: false,
          fallback: 'browser',
          receiptData: await this.formatReceiptForBrowser({
            sale,
            items,
            storeName: branding.displayName,
            storeCode: branding.businessCode,
            storeAddress,
            storePhone,
            storeTin,
            ...options
          })
        };
      }

      // Mark receipt as printed
      await db.prepare(`
        UPDATE sales SET receipt_printed = 1, updated_at = datetime('now'), sync_status = 'pending'
        WHERE id = ?
      `).run(saleId);

      return { success: true, method: 'thermal' };
    } catch (error) {
      console.error('Print receipt error:', error);
      return { success: false, error: error.message };
    }
  }

  async printThermalReceipt(data) {
    const { sale, items, storeName, storeCode, storeAddress, storePhone, storeTin } = data;
    let customerPoints = null;
    if (sale.customer_id) {
      const customer = await db.prepare(`
            SELECT loyalty_points FROM customers WHERE id = ?
          `).get(sale.customer_id);
      customerPoints = customer?.loyalty_points;
    }
    const receiptFooter = await this.getReceiptFooter();

    return new Promise((resolve, reject) => {
      try {
        
        this.printer.font('a')
          .align('ct')
          .style('b')
          .size(1, 1)
          .text(storeName.toUpperCase())
          .style('normal');
        if (storeCode) {
          this.printer.style('b').text(`Code: ${storeCode}`).style('normal');
        }
        this.printer
          .text(storeAddress)
          .text(`Tel: ${storePhone}`)
          .text(`TIN: ${storeTin}`)
          .hr()
          .align('lt')
          .text(`Receipt: ${sale.sale_number}`)
          .text(`Date: ${new Date(sale.created_at).toLocaleString('en-UG')}`)
          .text(`Cashier: ${sale.cashier_name}`)
          .text(`Customer: ${sale.customer_name || 'Guest'}`)
          .hr();

        // Print items
        items.forEach(item => {
          const itemLine = `${item.product_name.padEnd(20)} x${item.quantity}`;
          this.printer.text(itemLine);
          const priceLine = `UGX ${item.line_total.toLocaleString().padStart(15)}`;
          this.printer.text(priceLine);
        });

        this.printer.hr();

        // Print totals
        this.printer.text(`Subtotal:`.padEnd(20) + `UGX ${sale.subtotal.toLocaleString().padStart(15)}`);
        
        if (sale.discount_amount > 0) {
          this.printer.text(`Discount (${sale.discount_reason || 'Custom'}):`.padEnd(20) + 
                           `-UGX ${sale.discount_amount.toLocaleString().padStart(14)}`);
        }
        
        this.printer.text(`VAT (18%):`.padEnd(20) + `UGX ${sale.tax_amount.toLocaleString().padStart(15)}`);
        this.printer.hr();
        this.printer.style('b')
          .text(`TOTAL:`.padEnd(20) + `UGX ${sale.total_amount.toLocaleString().padStart(15)}`)
          .style('normal');
        
        this.printer.text(`PAID (${sale.payment_method.replace('_', ' ').toUpperCase()}):`.padEnd(20) + 
                         `UGX ${sale.amount_paid.toLocaleString().padStart(15)}`);
        
        if (sale.change_given > 0) {
          this.printer.text(`Change:`.padEnd(20) + `UGX ${sale.change_given.toLocaleString().padStart(15)}`);
        }

        if (sale.payment_reference) {
          this.printer.text(`Ref: ${sale.payment_reference}`);
        }

        this.printer.hr()
          .align('ct');

        // Loyalty points
        const loyaltyPoints = Math.round(sale.total_amount * 0.01); // 1% loyalty rate
        this.printer.text(`Loyalty Points: +${loyaltyPoints} pts`);
        
        if (customerPoints != null) {
          this.printer.text(`Total Points: ${customerPoints} pts`);
        }

        this.printer.hr()
          .text(receiptFooter)
          .text('     Come again!')
          .hr()
          .cut();

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async formatReceiptForBrowser(data) {
    const { sale, items, storeName, storeCode, storeAddress, storePhone, storeTin } = data;
    const loyaltyPoints = Math.round(sale.total_amount * 0.01);
    let customerPoints = null;
    if (sale.customer_id) {
      const customer = await db.prepare(`
        SELECT loyalty_points FROM customers WHERE id = ?
      `).get(sale.customer_id);
      customerPoints = customer?.loyalty_points;
    }
    
    let receiptHTML = `
      <div style="font-family: monospace; max-width: 400px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 18px;">${storeName.toUpperCase()}</h2>
          ${storeCode ? `<p style="margin: 4px 0; font-size: 14px; font-weight: bold;">Code: ${storeCode}</p>` : ''}
          <p style="margin: 2px 0; font-size: 12px;">${storeAddress}</p>
          <p style="margin: 2px 0; font-size: 12px;">Tel: ${storePhone}</p>
          <p style="margin: 2px 0; font-size: 12px;">TIN: ${storeTin}</p>
        </div>
        
        <div style="margin-bottom: 10px;">
          <p style="margin: 2px 0; font-size: 12px;"><strong>Receipt:</strong> ${sale.sale_number}</p>
          <p style="margin: 2px 0; font-size: 12px;"><strong>Date:</strong> ${new Date(sale.created_at).toLocaleString('en-UG')}</p>
          <p style="margin: 2px 0; font-size: 12px;"><strong>Cashier:</strong> ${sale.cashier_name}</p>
          <p style="margin: 2px 0; font-size: 12px;"><strong>Customer:</strong> ${sale.customer_name || 'Guest'}</p>
        </div>
        
        <div style="border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px;">
    `;

    items.forEach(item => {
      receiptHTML += `
        <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
          <span>${item.product_name} x${item.quantity}</span>
          <span>UGX ${item.line_total.toLocaleString()}</span>
        </div>
      `;
    });

    receiptHTML += `
        </div>
        
        <div style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
            <span>Subtotal:</span>
            <span>UGX ${sale.subtotal.toLocaleString()}</span>
          </div>
    `;

    if (sale.discount_amount > 0) {
      receiptHTML += `
          <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
            <span>Discount (${sale.discount_reason || 'Custom'}):</span>
            <span>-UGX ${sale.discount_amount.toLocaleString()}</span>
          </div>
      `;
    }

    receiptHTML += `
          <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
            <span>VAT (18%):</span>
            <span>UGX ${sale.tax_amount.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; border-top: 1px solid #000; padding-top: 5px; font-weight: bold;">
            <span>TOTAL:</span>
            <span>UGX ${sale.total_amount.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
            <span>PAID (${sale.payment_method.replace('_', ' ').toUpperCase()}):</span>
            <span>UGX ${sale.amount_paid.toLocaleString()}</span>
          </div>
    `;

    if (sale.change_given > 0) {
      receiptHTML += `
          <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
            <span>Change:</span>
            <span>UGX ${sale.change_given.toLocaleString()}</span>
          </div>
      `;
    }

    if (sale.payment_reference) {
      receiptHTML += `
          <div style="margin: 2px 0; font-size: 12px;">
            <span>Ref: ${sale.payment_reference}</span>
          </div>
      `;
    }

    receiptHTML += `
        </div>
        
        <div style="text-align: center; border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px;">
          <p style="margin: 2px 0; font-size: 12px;">Loyalty Points: +${loyaltyPoints} pts</p>
    `;

    if (customerPoints != null) {
      receiptHTML += `
          <p style="margin: 2px 0; font-size: 12px;">Total Points: ${customerPoints} pts</p>
        `;
    }

    receiptHTML += `
          <p style="margin: 5px 0; font-size: 12px;">${await this.getReceiptFooter()}</p>
          <p style="margin: 2px 0; font-size: 12px; font-style: italic;">Come again!</p>
        </div>
      </div>
      
      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    `;

    return receiptHTML;
  }

  async printReport(reportData, reportType) {
    try {
      if (this.printer) {
        // Thermal printer for simple reports
        await this.printThermalReport(reportData, reportType);
      } else {
        // Fallback to browser print
        return {
          success: false,
          fallback: 'browser',
          reportData: this.formatReportForBrowser(reportData, reportType)
        };
      }

      return { success: true, method: 'thermal' };
    } catch (error) {
      console.error('Print report error:', error);
      return { success: false, error: error.message };
    }
  }

  async printThermalReport(reportData, reportType) {
    return new Promise((resolve, reject) => {
      try {
        this.printer.font('a')
          .align('ct')
          .style('b')
          .text(`${reportType.toUpperCase()} REPORT`)
          .text(`Date: ${new Date().toLocaleString('en-UG')}`)
          .hr();

        // Print report data based on type
        switch (reportType) {
          case 'daily':
            this.printDailyReport(reportData);
            break;
          case 'sales':
            this.printSalesReport(reportData);
            break;
          default:
            this.printGenericReport(reportData);
        }

        this.printer.cut();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  printDailyReport(data) {
    this.printer.align('lt')
      .text(`Total Sales: ${data.sales_count || 0}`)
      .text(`Revenue: UGX ${(data.revenue || 0).toLocaleString()}`)
      .text(`Profit: UGX ${(data.profit || 0).toLocaleString()}`)
      .hr();

    if (data.paymentMethods && data.paymentMethods.length > 0) {
      this.printer.text('Payment Methods:');
      data.paymentMethods.forEach(method => {
        this.printer.text(`  ${method.payment_method}: UGX ${method.amount.toLocaleString()}`);
      });
    }
  }

  printSalesReport(data) {
    if (data.sales && data.sales.length > 0) {
      this.printer.text('Sales Summary:');
      data.sales.forEach(sale => {
        this.printer.text(`${sale.sale_number}: UGX ${sale.total_amount.toLocaleString()}`);
      });
    }
  }

  printGenericReport(data) {
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (typeof value === 'number') {
        this.printer.text(`${key}: UGX ${value.toLocaleString()}`);
      } else {
        this.printer.text(`${key}: ${value}`);
      }
    });
  }

  formatReportForBrowser(reportData, reportType) {
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1>${reportType.toUpperCase()} REPORT</h1>
          <p>Generated: ${new Date().toLocaleString('en-UG')}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
    `;

    // Format based on report type
    switch (reportType) {
      case 'daily':
        html += this.formatDailyReportHTML(reportData);
        break;
      case 'sales':
        html += this.formatSalesReportHTML(reportData);
        break;
      default:
        html += this.formatGenericReportHTML(reportData);
    }

    html += `
        </div>
      </div>
      
      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    `;

    return html;
  }

  formatDailyReportHTML(data) {
    return `
      <h2>Daily Summary</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Sales:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${data.sales_count || 0}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Revenue:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">UGX ${(data.revenue || 0).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Profit:</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">UGX ${(data.profit || 0).toLocaleString()}</td>
        </tr>
      </table>
    `;
  }

  formatSalesReportHTML(data) {
    if (!data.sales || data.sales.length === 0) {
      return '<p>No sales data available.</p>';
    }

    let html = `
      <h2>Sales Report</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Receipt #</th>
            <th style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Date</th>
            <th style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Customer</th>
            <th style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;">Amount</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.sales.forEach(sale => {
      html += `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${sale.sale_number}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${new Date(sale.created_at).toLocaleDateString()}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${sale.customer_name || 'Guest'}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">UGX ${sale.total_amount.toLocaleString()}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    return html;
  }

  formatGenericReportHTML(data) {
    let html = '<h2>Report Data</h2>';
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      html += `
        <p><strong>${key}:</strong> ${
          typeof value === 'number' ? `UGX ${value.toLocaleString()}` : value
        }</p>
      `;
    });

    return html;
  }

  // Utility methods
  async getBusinessBranding(businessId) {
    const settingsName = await this.getStoreName();
    if (!businessId) {
      return { displayName: settingsName, businessCode: null };
    }
    const biz = await db
      .prepare(`SELECT name, business_code FROM businesses WHERE id = ?`)
      .get(businessId);
    const displayName =
      biz?.name ||
      (settingsName && settingsName !== 'My Supermarket' ? settingsName : null) ||
      settingsName;
    return {
      displayName,
      businessCode: biz?.business_code ? String(biz.business_code).trim().toUpperCase() : null,
    };
  }

  async getStoreName() {
    const storeName = await db.prepare(`
      SELECT value FROM settings WHERE key = 'store_name'
    `).get()?.value || 'My Supermarket';
    return storeName;
  }

  async getStoreAddress() {
    const address = await db.prepare(`
      SELECT value FROM settings WHERE key = 'store_address'
    `).get()?.value || 'Kampala, Uganda';
    return address;
  }

  async getStorePhone() {
    const phone = await db.prepare(`
      SELECT value FROM settings WHERE key = 'store_phone'
    `).get()?.value || '+256700000000';
    return phone;
  }

  async getStoreTin() {
    const tin = await db.prepare(`
      SELECT value FROM settings WHERE key = 'store_tin'
    `).get()?.value || '';
    return tin;
  }

  async getReceiptFooter() {
    const footer = await db.prepare(`
      SELECT value FROM settings WHERE key = 'receipt_footer'
    `).get()?.value || 'Thank you for shopping with us!';
    return footer;
  }

  // Get printer status
  async getPrinterStatus() {
    try {
      if (!this.printer) {
        return { connected: false, error: 'No printer found' };
      }

      // Try a simple test print
      return { connected: true, device: this.defaultPrinter };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  // Reinitialize printer
  async reinitializePrinter() {
    try {
      await this.initialize();
      return await this.getPrinterStatus();
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

module.exports = new PrintService();
