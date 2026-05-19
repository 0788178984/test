const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const { getStoreToday, saleLocalDate } = require('../utils/storeTime');
const { SALE_LINE_COST } = require('../utils/saleSql');

const LD = saleLocalDate('s.created_at');

class PDFService {
  constructor() {
    this.tempDir = path.join(__dirname, '../../../temp');
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async generateSalesReport(from, to, options = {}) {
    try {
      const sales = await this.getSalesData(from, to, options);
      const filename = `sales_report_${from}_${to}.pdf`;
      const filepath = path.join(this.tempDir, filename);

      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filepath);
        
        doc.pipe(stream);

        // Header
        this.addHeader(doc, 'Sales Report', `From: ${from} To: ${to}`);

        // Summary table
        this.addSalesSummary(doc, sales);

        // Sales details table
        this.addSalesTable(doc, sales);

        // Footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => {
          resolve({
            success: true,
            filename,
            filepath,
            size: fs.statSync(filepath).size
          });
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Generate sales report PDF error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateDailyReport(date, options = {}) {
    try {
      const data = await this.getDailyData(date, options);
      const filename = `daily_report_${date}.pdf`;
      const filepath = path.join(this.tempDir, filename);

      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filepath);
        
        doc.pipe(stream);

        // Header
        this.addHeader(doc, 'Daily Report', date);

        // Summary cards
        this.addDailySummary(doc, data);

        // Hourly sales chart
        this.addHourlySales(doc, data.hourlySales);

        // Payment methods
        this.addPaymentMethods(doc, data.paymentMethods);

        // Footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => {
          resolve({
            success: true,
            filename,
            filepath,
            size: fs.statSync(filepath).size
          });
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Generate daily report PDF error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateProfitReport(from, to, options = {}) {
    try {
      const rows = await this.getProfitData(from, to, options);
      const sales = rows.map((s) => ({
        ...s,
        revenue: Number(s.total_amount) || 0,
        profit: (Number(s.total_amount) || 0) - (Number(s.cost) || 0),
      }));
      const data = { sales };
      const filename = `profit_report_${from}_${to}.pdf`;
      const filepath = path.join(this.tempDir, filename);

      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filepath);
        
        doc.pipe(stream);

        // Header
        this.addHeader(doc, 'Profit & Loss Report', `From: ${from} To: ${to}`);

        // Profit summary
        this.addProfitSummary(doc, data);

        // Detailed profit table
        this.addProfitTable(doc, data.sales);

        // Footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => {
          resolve({
            success: true,
            filename,
            filepath,
            size: fs.statSync(filepath).size
          });
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Generate profit report PDF error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateInventoryReport(options = {}) {
    try {
      const data = await this.getInventoryData(options);
      const filename = `inventory_report_${getStoreToday()}.pdf`;
      const filepath = path.join(this.tempDir, filename);

      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filepath);
        
        doc.pipe(stream);

        // Header
        this.addHeader(doc, 'Inventory Report', new Date().toLocaleDateString());

        // Inventory summary
        this.addInventorySummary(doc, data);

        // Low stock items
        this.addLowStockItems(doc, data.lowStock);

        // Expiring items
        this.addExpiringItems(doc, data.expiring);

        // Footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => {
          resolve({
            success: true,
            filename,
            filepath,
            size: fs.statSync(filepath).size
          });
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Generate inventory report PDF error:', error);
      return { success: false, error: error.message };
    }
  }

  // PDF layout methods
  addHeader(doc, title, subtitle) {
    doc.fontSize(24).font('Helvetica-Bold').text(title, { align: 'center' });
    
    if (subtitle) {
      doc.fontSize(14).font('Helvetica').text(subtitle, { align: 'center' });
    }

    // Store info
    const storeName = this.getStoreName();
    const storeAddress = this.getStoreAddress();
    const storePhone = this.getStorePhone();

    doc.fontSize(10).font('Helvetica')
      .text(`Generated by: ${storeName}`, { align: 'center' })
      .text(storeAddress, { align: 'center' })
      .text(storePhone, { align: 'center' })
      .moveDown();
  }

  addFooter(doc) {
    const bottom = doc.page.height - 50;
    
    doc.fontSize(8).font('Helvetica')
      .text('Generated by Uganda Supermarket Management System', 50, bottom, { align: 'center' })
      .text(`Page ${doc.pageCount}`, 50, bottom - 20, { align: 'center' });
  }

  addSalesSummary(doc, sales) {
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
    const totalProfit = sales.reduce((sum, sale) => sum + (sale.total_amount - sale.cost), 0);
    const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0;

    doc.fontSize(16).font('Helvetica-Bold').text('Sales Summary').moveDown();

    // Summary boxes
    const boxWidth = 150;
    const boxHeight = 60;
    const startX = 50;
    const startY = doc.y;

    // Total Revenue
    this.drawSummaryBox(doc, startX, startY, boxWidth, boxHeight, 'Total Revenue', `UGX ${totalRevenue.toLocaleString()}`);

    // Total Profit
    this.drawSummaryBox(doc, startX + boxWidth + 20, startY, boxWidth, boxHeight, 'Total Profit', `UGX ${totalProfit.toLocaleString()}`);

    // Average Sale
    this.drawSummaryBox(doc, startX + (boxWidth + 20) * 2, startY, boxWidth, boxHeight, 'Average Sale', `UGX ${Math.round(avgSale).toLocaleString()}`);

    // Number of Sales
    this.drawSummaryBox(doc, startX + (boxWidth + 20) * 3, startY, boxWidth, boxHeight, 'Number of Sales', sales.length.toString());

    doc.y = startY + boxHeight + 20;
    doc.moveDown();
  }

  drawSummaryBox(doc, x, y, width, height, label, value) {
    doc.rect(x, y, width, height).stroke();
    
    doc.fontSize(10).font('Helvetica').text(label, x + 5, y + 5);
    doc.fontSize(14).font('Helvetica-Bold').text(value, x + 5, y + 25);
  }

  addSalesTable(doc, sales) {
    doc.fontSize(16).font('Helvetica-Bold').text('Sales Details').moveDown();

    const tableTop = doc.y;
    const itemHeight = 20;
    const headers = ['Receipt #', 'Date', 'Customer', 'Cashier', 'Amount', 'Payment Method'];
    const columnWidths = [80, 80, 100, 80, 80, 100];

    // Table header
    doc.fontSize(10).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(header, x, tableTop);
    });

    // Table rows
    doc.fontSize(9).font('Helvetica');
    sales.forEach((sale, index) => {
      const y = tableTop + itemHeight + (index * itemHeight);
      const row = [
        sale.sale_number,
        new Date(sale.created_at).toLocaleDateString(),
        sale.customer_name || 'Guest',
        sale.cashier_name,
        `UGX ${sale.total_amount.toLocaleString()}`,
        sale.payment_method.replace('_', ' ').toUpperCase()
      ];

      row.forEach((cell, i) => {
        const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(cell, x, y);
      });
    });

    doc.y = tableTop + itemHeight + (sales.length * itemHeight) + 20;
    doc.moveDown();
  }

  addDailySummary(doc, data) {
    doc.fontSize(16).font('Helvetica-Bold').text('Daily Summary').moveDown();

    const summary = [
      { label: 'Total Sales', value: data.summary.sales_count || 0 },
      { label: 'Revenue', value: `UGX ${(data.summary.revenue || 0).toLocaleString()}` },
      { label: 'Profit', value: `UGX ${(data.summary.profit || 0).toLocaleString()}` },
      { label: 'Average Sale', value: `UGX ${Math.round((data.summary.revenue || 0) / (data.summary.sales_count || 1)).toLocaleString()}` }
    ];

    summary.forEach((item, index) => {
      const y = doc.y;
      doc.fontSize(12).font('Helvetica-Bold').text(`${item.label}:`, 50, y);
      doc.fontSize(12).font('Helvetica').text(item.value, 200, y);
      doc.moveDown();
    });

    doc.moveDown();
  }

  addHourlySales(doc, hourlySales) {
    if (!hourlySales || hourlySales.length === 0) return;

    doc.fontSize(16).font('Helvetica-Bold').text('Hourly Sales').moveDown();

    // Simple bar chart
    const chartWidth = 400;
    const chartHeight = 150;
    const chartX = 50;
    const chartY = doc.y;
    const maxSales = Math.max(...hourlySales.map(h => h.sales_count || 0));

    // Draw axes
    doc.moveTo(chartX, chartY + chartHeight).lineTo(chartX + chartWidth, chartY + chartHeight).stroke();
    doc.moveTo(chartX, chartY).lineTo(chartX, chartY + chartHeight).stroke();

    // Draw bars
    const barWidth = chartWidth / hourlySales.length;
    hourlySales.forEach((hour, index) => {
      const barHeight = (hour.sales_count / maxSales) * (chartHeight - 20);
      const x = chartX + (index * barWidth) + 5;
      const y = chartY + chartHeight - barHeight;

      doc.rect(x, y, barWidth - 10, barHeight).fillAndStroke('#4CAF50', '#000');
      
      // Hour label
      doc.fontSize(8).font('Helvetica').text(`${hour.hour}:00`, x, chartY + chartHeight + 5);
    });

    doc.y = chartY + chartHeight + 30;
    doc.moveDown();
  }

  addPaymentMethods(doc, paymentMethods) {
    if (!paymentMethods || paymentMethods.length === 0) return;

    doc.fontSize(16).font('Helvetica-Bold').text('Payment Methods').moveDown();

    paymentMethods.forEach(method => {
      doc.fontSize(12).font('Helvetica').text(
        `${method.payment_method.replace('_', ' ').toUpperCase()}: UGX ${method.amount.toLocaleString()} (${method.count} transactions)`,
        50, doc.y
      );
      doc.moveDown();
    });

    doc.moveDown();
  }

  addProfitSummary(doc, data) {
    const totalRevenue = data.sales.reduce((sum, sale) => sum + sale.revenue, 0);
    const totalCost = data.sales.reduce((sum, sale) => sum + sale.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    doc.fontSize(16).font('Helvetica-Bold').text('Profit Summary').moveDown();

    const summary = [
      { label: 'Total Revenue', value: `UGX ${totalRevenue.toLocaleString()}` },
      { label: 'Total Cost', value: `UGX ${totalCost.toLocaleString()}` },
      { label: 'Total Profit', value: `UGX ${totalProfit.toLocaleString()}` },
      { label: 'Profit Margin', value: `${profitMargin.toFixed(2)}%` }
    ];

    summary.forEach((item, index) => {
      const y = doc.y;
      doc.fontSize(12).font('Helvetica-Bold').text(`${item.label}:`, 50, y);
      doc.fontSize(12).font('Helvetica').text(item.value, 200, y);
      doc.moveDown();
    });

    doc.moveDown();
  }

  addProfitTable(doc, sales) {
    doc.fontSize(16).font('Helvetica-Bold').text('Sales Profit Details').moveDown();

    const tableTop = doc.y;
    const itemHeight = 20;
    const headers = ['Receipt #', 'Date', 'Revenue', 'Cost', 'Profit', 'Margin %'];
    const columnWidths = [80, 80, 80, 80, 80, 80];

    // Table header
    doc.fontSize(10).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(header, x, tableTop);
    });

    // Table rows
    doc.fontSize(9).font('Helvetica');
    sales.forEach((sale, index) => {
      const y = tableTop + itemHeight + (index * itemHeight);
      const margin = sale.revenue > 0 ? ((sale.profit / sale.revenue) * 100).toFixed(1) : '0.0';
      const row = [
        sale.sale_number,
        new Date(sale.created_at).toLocaleDateString(),
        `UGX ${sale.revenue.toLocaleString()}`,
        `UGX ${sale.cost.toLocaleString()}`,
        `UGX ${sale.profit.toLocaleString()}`,
        `${margin}%`
      ];

      row.forEach((cell, i) => {
        const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(cell, x, y);
      });
    });

    doc.y = tableTop + itemHeight + (sales.length * itemHeight) + 20;
    doc.moveDown();
  }

  addInventorySummary(doc, data) {
    doc.fontSize(16).font('Helvetica-Bold').text('Inventory Summary').moveDown();

    const summary = [
      { label: 'Total Products', value: data.summary.total_products || 0 },
      { label: 'Active Products', value: data.summary.active_products || 0 },
      { label: 'Low Stock Items', value: data.summary.low_stock_count || 0 },
      { label: 'Total Value', value: `UGX ${(data.summary.total_value || 0).toLocaleString()}` }
    ];

    summary.forEach((item, index) => {
      const y = doc.y;
      doc.fontSize(12).font('Helvetica-Bold').text(`${item.label}:`, 50, y);
      doc.fontSize(12).font('Helvetica').text(item.value, 200, y);
      doc.moveDown();
    });

    doc.moveDown();
  }

  addLowStockItems(doc, lowStock) {
    if (!lowStock || lowStock.length === 0) return;

    doc.fontSize(16).font('Helvetica-Bold').text('Low Stock Items').moveDown();

    const tableTop = doc.y;
    const itemHeight = 20;
    const headers = ['Product', 'Current Stock', 'Min Stock', 'Unit'];
    const columnWidths = [150, 80, 80, 80];

    // Table header
    doc.fontSize(10).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(header, x, tableTop);
    });

    // Table rows
    doc.fontSize(9).font('Helvetica');
    lowStock.forEach((item, index) => {
      const y = tableTop + itemHeight + (index * itemHeight);
      const row = [
        item.name,
        item.current_stock.toString(),
        item.minimum_stock.toString(),
        item.unit
      ];

      row.forEach((cell, i) => {
        const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(cell, x, y);
      });
    });

    doc.y = tableTop + itemHeight + (lowStock.length * itemHeight) + 20;
    doc.moveDown();
  }

  addExpiringItems(doc, expiring) {
    if (!expiring || expiring.length === 0) return;

    doc.fontSize(16).font('Helvetica-Bold').text('Expiring Products').moveDown();

    const tableTop = doc.y;
    const itemHeight = 20;
    const headers = ['Product', 'Expiry Date', 'Current Stock', 'Status'];
    const columnWidths = [150, 80, 80, 80];

    // Table header
    doc.fontSize(10).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(header, x, tableTop);
    });

    // Table rows
    doc.fontSize(9).font('Helvetica');
    expiring.forEach((item, index) => {
      const y = tableTop + itemHeight + (index * itemHeight);
      const status = item.expiry_status || 'warning';
      const row = [
        item.name,
        item.expiry_date,
        item.current_stock.toString(),
        status.charAt(0).toUpperCase() + status.slice(1)
      ];

      row.forEach((cell, i) => {
        const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(cell, x, y);
      });
    });

    doc.y = tableTop + itemHeight + (expiring.length * itemHeight) + 20;
    doc.moveDown();
  }

  // Data retrieval methods
  async getSalesData(from, to, options) {
    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required for sales export');

    let query = `
      SELECT
        s.sale_number, s.created_at, s.total_amount, s.payment_method,
        u.name as cashier_name,
        c.name as customer_name,
        ${SALE_LINE_COST} as cost
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE ${LD} >= ?
      AND ${LD} <= ?
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const params = [from, to, bid];

    if (options.cashier_id) {
      query += ` AND s.cashier_id = ?`;
      params.push(options.cashier_id);
    }

    query += ` ORDER BY s.created_at DESC`;

    return await db.prepare(query).all(...params);
  }

  async getDailyData(date, options) {
    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required');

    const summary = await db.prepare(`
      SELECT
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price)
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `).get(date, bid);

    const hourlySales = await db.prepare(`
      SELECT
        strftime('%H', s.created_at) as hour,
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue
      FROM sales s
      WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
      GROUP BY strftime('%H', s.created_at)
      ORDER BY hour
    `).all(date, bid);

    const paymentMethods = await db.prepare(`
      SELECT payment_method, COUNT(*) as count, SUM(total_amount) as amount
      FROM sales s
      WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
      GROUP BY payment_method
    `).all(date, bid);

    return { summary, hourlySales, paymentMethods };
  }

  async getProfitData(from, to, options) {
    return this.getSalesData(from, to, options);
  }

  async getInventoryData(options) {
    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required');

    const summary = await db.prepare(`
      SELECT
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_products,
        COUNT(CASE WHEN current_stock <= minimum_stock THEN 1 END) as low_stock_count,
        SUM(current_stock * buying_price) as total_value
      FROM products
      WHERE deleted_at IS NULL AND business_id = ?
    `).get(bid);

    const lowStock = await db.prepare(`
      SELECT name, current_stock, minimum_stock, unit
      FROM products
      WHERE current_stock <= minimum_stock
      AND is_active = 1
      AND deleted_at IS NULL
      AND business_id = ?
      ORDER BY current_stock ASC
    `).all(bid);

    const expiring = await db.prepare(`
      SELECT name, expiry_date, current_stock,
        CASE
          WHEN date(expiry_date) < date('now') THEN 'expired'
          WHEN date(expiry_date) <= date('now', '+7 days') THEN 'critical'
          WHEN date(expiry_date) <= date('now', '+30 days') THEN 'warning'
          ELSE 'ok'
        END as expiry_status
      FROM products
      WHERE expiry_date IS NOT NULL
      AND current_stock > 0
      AND date(expiry_date) <= date('now', '+30 days')
      AND deleted_at IS NULL
      AND business_id = ?
      ORDER BY expiry_date ASC
    `).all(bid);

    return { summary, lowStock, expiring };
  }

  // Utility methods
  getStoreName() {
    return 'My Supermarket';
  }

  getStoreAddress() {
    return 'Kampala, Uganda';
  }

  getStorePhone() {
    return '+256700000000';
  }

  // Clean up temporary files
  cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      
      files.forEach(file => {
        const filepath = path.join(this.tempDir, file);
        const stats = fs.statSync(filepath);
        
        // Delete files older than 1 hour
        if (now - stats.mtime.getTime() > 3600000) {
          fs.unlinkSync(filepath);
        }
      });
    } catch (error) {
      console.error('Cleanup temp files error:', error);
    }
  }
}

module.exports = new PDFService();
