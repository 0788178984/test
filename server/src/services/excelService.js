const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');

class ExcelService {
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
      const filename = `sales_report_${from}_${to}.xlsx`;
      const filepath = path.join(this.tempDir, filename);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      // Add header row
      worksheet.columns = [
        { header: 'Receipt #', key: 'sale_number', width: 15 },
        { header: 'Date', key: 'created_at', width: 20 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Cashier', key: 'cashier_name', width: 20 },
        { header: 'Payment Method', key: 'payment_method', width: 15 },
        { header: 'Subtotal', key: 'subtotal', width: 15 },
        { header: 'Discount', key: 'discount_amount', width: 15 },
        { header: 'Tax', key: 'tax_amount', width: 15 },
        { header: 'Total', key: 'total_amount', width: 15 },
        { header: 'Cost', key: 'cost', width: 15 },
        { header: 'Profit', key: 'profit', width: 15 }
      ];

      // Add data rows
      sales.forEach(sale => {
        worksheet.addRow({
          ...sale,
          created_at: new Date(sale.created_at).toLocaleString(),
          payment_method: sale.payment_method.replace('_', ' ').toUpperCase(),
          subtotal: sale.subtotal || 0,
          discount_amount: sale.discount_amount || 0,
          tax_amount: sale.tax_amount || 0,
          cost: sale.cost || 0,
          profit: sale.profit || 0
        });
      });

      // Add summary row
      const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
      const totalCost = sales.reduce((sum, sale) => sum + sale.cost, 0);
      const totalProfit = totalRevenue - totalCost;

      worksheet.addRow({});
      worksheet.addRow({
        sale_number: 'TOTAL',
        total_amount: totalRevenue,
        cost: totalCost,
        profit: totalProfit
      });

      // Style summary row
      const summaryRow = worksheet.lastRow;
      summaryRow.eachCell((cell, colNumber) => {
        if (colNumber >= 9) { // Total, Cost, Profit columns
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
        }
      });

      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size,
        rowCount: sales.length
      };
    } catch (error) {
      console.error('Generate sales Excel report error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateDailyReport(date, options = {}) {
    try {
      const data = await this.getDailyData(date, options);
      const filename = `daily_report_${date}.xlsx`;
      const filepath = path.join(this.tempDir, filename);

      const workbook = new ExcelJS.Workbook();
      
      // Summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      summarySheet.addRows([
        { metric: 'Date', value: date },
        { metric: 'Total Sales', value: data.summary.sales_count || 0 },
        { metric: 'Revenue', value: (data.summary.revenue || 0).toLocaleString() },
        { metric: 'Profit', value: (data.summary.profit || 0).toLocaleString() },
        { metric: 'Average Sale', value: Math.round((data.summary.revenue || 0) / (data.summary.sales_count || 1)).toLocaleString() }
      ]);

      // Hourly sales sheet
      if (data.hourlySales && data.hourlySales.length > 0) {
        const hourlySheet = workbook.addWorksheet('Hourly Sales');
        hourlySheet.columns = [
          { header: 'Hour', key: 'hour', width: 10 },
          { header: 'Sales Count', key: 'sales_count', width: 15 },
          { header: 'Revenue', key: 'revenue', width: 15 }
        ];

        data.hourlySales.forEach(hour => {
          hourlySheet.addRow({
            hour: `${hour.hour}:00`,
            sales_count: hour.sales_count,
            revenue: hour.revenue
          });
        });
      }

      // Payment methods sheet
      if (data.paymentMethods && data.paymentMethods.length > 0) {
        const paymentSheet = workbook.addWorksheet('Payment Methods');
        paymentSheet.columns = [
          { header: 'Payment Method', key: 'payment_method', width: 20 },
          { header: 'Count', key: 'count', width: 15 },
          { header: 'Amount', key: 'amount', width: 15 }
        ];

        data.paymentMethods.forEach(method => {
          paymentSheet.addRow({
            payment_method: method.payment_method.replace('_', ' ').toUpperCase(),
            count: method.count,
            amount: method.amount
          });
        });
      }

      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size
      };
    } catch (error) {
      console.error('Generate daily Excel report error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateProfitReport(from, to, options = {}) {
    try {
      const sales = await this.getSalesData(from, to, options);
      const filename = `profit_report_${from}_${to}.xlsx`;
      const filepath = path.join(this.tempDir, filename);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Profit Report');

      worksheet.columns = [
        { header: 'Receipt #', key: 'sale_number', width: 15 },
        { header: 'Date', key: 'created_at', width: 20 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Cashier', key: 'cashier_name', width: 20 },
        { header: 'Revenue', key: 'total_amount', width: 15 },
        { header: 'Cost', key: 'cost', width: 15 },
        { header: 'Profit', key: 'profit', width: 15 },
        { header: 'Margin %', key: 'margin_percent', width: 12 }
      ];

      sales.forEach(sale => {
        const marginPercent = sale.total_amount > 0 ? ((sale.profit / sale.total_amount) * 100).toFixed(2) : '0.00';
        worksheet.addRow({
          ...sale,
          created_at: new Date(sale.created_at).toLocaleString(),
          margin_percent: parseFloat(marginPercent)
        });
      });

      // Add summary section
      worksheet.addRow({});
      worksheet.addRow({ sale_number: 'PROFIT SUMMARY' });
      
      const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
      const totalCost = sales.reduce((sum, sale) => sum + sale.cost, 0);
      const totalProfit = totalRevenue - totalCost;
      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(2) : '0.00';

      worksheet.addRow({ sale_number: 'Total Revenue', total_amount: totalRevenue });
      worksheet.addRow({ sale_number: 'Total Cost', total_amount: totalCost });
      worksheet.addRow({ sale_number: 'Total Profit', total_amount: totalProfit });
      worksheet.addRow({ sale_number: 'Average Margin %', total_amount: avgMargin });

      // Style summary rows
      const startRow = worksheet.rowCount - 4;
      for (let i = startRow; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        row.eachCell((cell, colNumber) => {
          if (colNumber === 1) {
            cell.font = { bold: true };
          }
          if (colNumber >= 5) { // Revenue, Cost, Profit, Margin columns
            cell.font = { bold: true };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE0E0E0' }
            };
          }
        });
      }

      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size,
        rowCount: sales.length
      };
    } catch (error) {
      console.error('Generate profit Excel report error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateInventoryReport(options = {}) {
    try {
      const data = await this.getInventoryData(options);
      const filename = `inventory_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      const filepath = path.join(this.tempDir, filename);

      const workbook = new ExcelJS.Workbook();
      
      // Inventory summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      summarySheet.addRows([
        { metric: 'Total Products', value: data.summary.total_products || 0 },
        { metric: 'Active Products', value: data.summary.active_products || 0 },
        { metric: 'Low Stock Items', value: data.summary.low_stock_count || 0 },
        { metric: 'Total Value', value: (data.summary.total_value || 0).toLocaleString() }
      ]);

      // Products sheet
      const productsSheet = workbook.addWorksheet('Products');
      productsSheet.columns = [
        { header: 'Product Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Current Stock', key: 'current_stock', width: 15 },
        { header: 'Min Stock', key: 'minimum_stock', width: 15 },
        { header: 'Buying Price', key: 'buying_price', width: 15 },
        { header: 'Selling Price', key: 'selling_price', width: 15 },
        { header: 'Total Value', key: 'total_value', width: 15 },
        { header: 'Supplier', key: 'supplier_name', width: 20 }
      ];

      // Get all products with calculations
      const allProducts = await db.prepare(`
        SELECT p.*, s.name as supplier_name,
               (p.current_stock * p.buying_price) as total_value
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.deleted_at IS NULL
        ORDER BY p.name
      `).all();

      allProducts.forEach(product => {
        productsSheet.addRow({
          ...product,
          buying_price: product.buying_price || 0,
          selling_price: product.selling_price || 0,
          total_value: product.total_value || 0
        });
      });

      // Low stock sheet
      if (data.lowStock && data.lowStock.length > 0) {
        const lowStockSheet = workbook.addWorksheet('Low Stock');
        lowStockSheet.columns = [
          { header: 'Product Name', key: 'name', width: 30 },
          { header: 'Current Stock', key: 'current_stock', width: 15 },
          { header: 'Min Stock', key: 'minimum_stock', width: 15 },
          { header: 'Unit', key: 'unit', width: 10 },
          { header: 'Supplier', key: 'supplier_name', width: 20 }
        ];

        data.lowStock.forEach(item => {
          lowStockSheet.addRow(item);
        });

        // Highlight low stock rows
        lowStockSheet.eachRow((row, rowNumber) => {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFCCCC' }
            };
          });
        });
      }

      // Expiring products sheet
      if (data.expiring && data.expiring.length > 0) {
        const expiringSheet = workbook.addWorksheet('Expiring Products');
        expiringSheet.columns = [
          { header: 'Product Name', key: 'name', width: 30 },
          { header: 'Expiry Date', key: 'expiry_date', width: 15 },
          { header: 'Current Stock', key: 'current_stock', width: 15 },
          { header: 'Status', key: 'expiry_status', width: 15 },
          { header: 'Supplier', key: 'supplier_name', width: 20 }
        ];

        data.expiring.forEach(item => {
          expiringSheet.addRow({
            ...item,
            expiry_status: item.expiry_status ? item.expiry_status.charAt(0).toUpperCase() + item.expiry_status.slice(1) : ''
          });
        });

        // Color code by status
        expiringSheet.eachRow((row, rowNumber) => {
          const status = row.getCell(4).value; // Status column
          let color = 'FFFFFF';
          
          if (status === 'Expired') {
            color = 'FFFFCCCC'; // Red
          } else if (status === 'Critical') {
            color = 'FFFFE699'; // Yellow
          } else if (status === 'Warning') {
            color = 'FFFFCC99'; // Orange
          }

          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: color }
            };
          });
        });
      }

      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size
      };
    } catch (error) {
      console.error('Generate inventory Excel report error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateBestSellersReport(from, to, options = {}) {
    try {
      const bestSellers = await this.getBestSellersData(from, to, options);
      const filename = `best_sellers_${from}_${to}.xlsx`;
      const filepath = path.join(this.tempDir, filename);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Best Sellers');

      worksheet.columns = [
        { header: 'Product Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Total Quantity', key: 'total_quantity', width: 15 },
        { header: 'Total Revenue', key: 'total_revenue', width: 15 },
        { header: 'Sales Count', key: 'sales_count', width: 15 },
        { header: 'Average Price', key: 'avg_price', width: 15 },
        { header: 'Profit Margin', key: 'profit_margin', width: 15 }
      ];

      bestSellers.forEach(product => {
        const profitMargin = product.total_revenue > 0 && product.total_cost > 0 
          ? ((product.total_revenue - product.total_cost) / product.total_revenue * 100).toFixed(2)
          : '0.00';

        worksheet.addRow({
          ...product,
          total_revenue: product.total_revenue || 0,
          avg_price: product.avg_price || 0,
          profit_margin: parseFloat(profitMargin)
        });
      });

      // Add chart data summary
      worksheet.addRow({});
      worksheet.addRow({ name: 'TOP 5 SUMMARY' });
      
      const top5 = bestSellers.slice(0, 5);
      top5.forEach((product, index) => {
        worksheet.addRow({
          name: `#${index + 1} ${product.name}`,
          total_quantity: product.total_quantity,
          total_revenue: product.total_revenue
        });
      });

      // Style summary rows
      const startRow = worksheet.rowCount - top5.length - 1;
      for (let i = startRow; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        row.eachCell((cell) => {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
        });
      }

      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size,
        rowCount: bestSellers.length
      };
    } catch (error) {
      console.error('Generate best sellers Excel report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Data retrieval methods (same as PDF service)
  async getSalesData(from, to, options) {
    let query = `
      SELECT 
        s.sale_number, s.created_at, s.total_amount, s.payment_method,
        s.subtotal, s.discount_amount, s.tax_amount,
        u.name as cashier_name,
        c.name as customer_name,
        SUM(si.quantity * si.buying_price) as cost,
        (s.total_amount - SUM(si.quantity * si.buying_price)) as profit
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE date(s.created_at) >= date(?) 
      AND date(s.created_at) <= date(?)
      AND s.status = 'completed' 
      AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required for sales export');
    const params = [from, to, bid];

    if (options.cashier_id) {
      query += ` AND s.cashier_id = ?`;
      params.push(options.cashier_id);
    }

    query += ` GROUP BY s.id ORDER BY s.created_at DESC`;

    return await db.prepare(query).all(...params);
  }

  async getDailyData(date, options) {
    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required');

    // Get summary
    const summary = await db.prepare(`
      SELECT
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price)
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE date(s.created_at) = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `).get(date, bid);

    // Get hourly sales
    const hourlySales = await db.prepare(`
      SELECT
        strftime('%H', created_at) as hour,
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue
      FROM sales s
      WHERE date(s.created_at) = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
      GROUP BY strftime('%H', created_at)
      ORDER BY hour
    `).all(date, bid);

    // Get payment methods
    const paymentMethods = await db.prepare(`
      SELECT payment_method, COUNT(*) as count, SUM(total_amount) as amount
      FROM sales s
      WHERE date(s.created_at) = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
      GROUP BY payment_method
    `).all(date, bid);

    return { summary, hourlySales, paymentMethods };
  }

  async getBestSellersData(from, to, options) {
    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required');

    let query = `
      SELECT
        p.id,
        p.name,
        p.category,
        SUM(si.quantity) as total_quantity,
        SUM(si.line_total) as total_revenue,
        COUNT(DISTINCT si.sale_id) as sales_count,
        AVG(si.unit_price) as avg_price,
        SUM(si.quantity * si.buying_price) as total_cost
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'completed'
      AND s.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND s.business_id = ? AND p.business_id = ?
    `;

    const params = [bid, bid];

    if (from) {
      query += ` AND date(s.created_at) >= date(?)`;
      params.push(from);
    }

    if (to) {
      query += ` AND date(s.created_at) <= date(?)`;
      params.push(to);
    }

    query += `
      GROUP BY si.product_id 
      ORDER BY total_quantity DESC
    `;

    if (options.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }

    return await db.prepare(query).all(...params);
  }

  async getInventoryData(options) {
    const bid = options.business_id;
    if (!bid) throw new Error('business_id is required');

    // Get summary
    const summary = await db.prepare(`
      SELECT
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_products,
        COUNT(CASE WHEN current_stock <= minimum_stock THEN 1 END) as low_stock_count,
        SUM(current_stock * buying_price) as total_value
      FROM products
      WHERE deleted_at IS NULL AND business_id = ?
    `).get(bid);

    // Get low stock items
    const lowStock = await db.prepare(`
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.current_stock <= p.minimum_stock
      AND p.is_active = 1
      AND p.deleted_at IS NULL
      AND p.business_id = ?
      ORDER BY p.current_stock ASC
    `).all(bid);

    // Get expiring items
    const expiring = await db.prepare(`
      SELECT p.*, s.name as supplier_name,
        CASE
          WHEN date(p.expiry_date) < date('now') THEN 'expired'
          WHEN date(p.expiry_date) <= date('now', '+7 days') THEN 'critical'
          WHEN date(p.expiry_date) <= date('now', '+30 days') THEN 'warning'
          ELSE 'ok'
        END as expiry_status
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.expiry_date IS NOT NULL
      AND p.current_stock > 0
      AND date(p.expiry_date) <= date('now', '+30 days')
      AND p.deleted_at IS NULL
      AND p.business_id = ?
      ORDER BY p.expiry_date ASC
    `).all(bid);

    return { summary, lowStock, expiring };
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

module.exports = new ExcelService();
