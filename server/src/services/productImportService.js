const ExcelJS = require('exceljs');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const {
  getProductCategories,
  normalizeProductCategory,
} = require('../db/businessTypes');
const { assertSellingNotBelowCost } = require('../utils/money');

const ALLOWED_UNITS = ['piece', 'pack', 'strip', 'bottle', 'tube', 'vial', 'litre', 'kg', 'g', 'box'];

const TEMPLATE_COLUMNS = [
  { header: 'name', key: 'name', width: 28 },
  { header: 'category', key: 'category', width: 18 },
  { header: 'sku', key: 'sku', width: 14 },
  { header: 'barcode', key: 'barcode', width: 16 },
  { header: 'unit', key: 'unit', width: 10 },
  { header: 'buying_price', key: 'buying_price', width: 14 },
  { header: 'selling_price', key: 'selling_price', width: 14 },
  { header: 'current_stock', key: 'current_stock', width: 14 },
  { header: 'minimum_stock', key: 'minimum_stock', width: 14 },
  { header: 'supplier_name', key: 'supplier_name', width: 22 },
  { header: 'expiry_date', key: 'expiry_date', width: 14 },
  { header: 'is_active', key: 'is_active', width: 10 },
];

const EXAMPLE_ROW = {
  name: 'Sample Rice 1kg',
  category: 'Food',
  sku: 'RICE-1KG',
  barcode: '6001234567890',
  unit: 'piece',
  buying_price: 3500,
  selling_price: 4500,
  current_stock: 24,
  minimum_stock: 5,
  supplier_name: '',
  expiry_date: '',
  is_active: 'yes',
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[*]/g, '');
}

function isGuideRow(name, buyingPrice) {
  const n = String(name || '').trim();
  if (!n) return true;
  const upper = n.toUpperCase();
  if (
    upper.startsWith('#') ||
    upper.startsWith('GUIDE') ||
    upper.includes('DELETE THIS') ||
    upper.includes('DO NOT IMPORT') ||
    upper.includes('INSTRUCTION')
  ) {
    return true;
  }
  if (n.toLowerCase() === 'sample rice 1kg') return true;
  const buyLabel = String(buyingPrice ?? '')
    .trim()
    .toLowerCase();
  if (['required', 'yes', 'number', 'ugx', 'see instructions', 'required (ugx)'].includes(buyLabel)) {
    return true;
  }
  return false;
}

function parseBool(value) {
  if (value === undefined || value === null || String(value).trim() === '') return true;
  const v = String(value).trim().toLowerCase();
  return !['no', 'n', '0', 'false', 'inactive'].includes(v);
}

function parseDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function cellValue(cell) {
  if (!cell || cell.value === undefined || cell.value === null) return '';
  if (typeof cell.value === 'object' && cell.value.text) return cell.value.text;
  if (typeof cell.value === 'object' && cell.value.result !== undefined) return cell.value.result;
  return cell.value;
}

async function resolveSupplierId(supplierName, businessId) {
  const name = String(supplierName || '').trim();
  if (!name) return null;
  const existing = await db
    .prepare(
      `SELECT id FROM suppliers WHERE business_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1`
    )
    .get(businessId, name);
  if (existing?.id) return existing.id;
  const supplierId = newId('sup');
  await db
    .prepare(
      `INSERT INTO suppliers (id, name, business_id, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, datetime('now'), datetime('now'), 'pending')`
    )
    .run(supplierId, name, businessId);
  return supplierId;
}

class ProductImportService {
  async buildTemplateBuffer(businessType) {
    const categories = getProductCategories(businessType);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Uganda Supermarket Manager';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Products');
    sheet.columns = TEMPLATE_COLUMNS;

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F0FE' },
    };

    const guideFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF8E1' },
    };

    sheet.addRow({
      name: '# GUIDE — import skips rows starting with # (safe to leave in file)',
      category: `Allowed: ${categories.join(', ')}`,
      sku: 'Optional, unique',
      barcode: 'Optional, unique',
      unit: ALLOWED_UNITS.join(', '),
      buying_price: 'Required (UGX whole number)',
      selling_price: 'Required, must be ≥ buying',
      current_stock: 'Opening qty (0 if none)',
      minimum_stock: 'Default 5',
      supplier_name: 'Created if new name',
      expiry_date: 'YYYY-MM-DD or blank',
      is_active: 'yes or no',
    });
    sheet.getRow(2).eachCell((cell) => {
      cell.fill = guideFill;
      cell.font = { italic: true, size: 10, color: { argb: 'FF6B5B00' } };
    });

    sheet.addRow({
      name: '# GUIDE — delete guide rows if you prefer a clean sheet',
      category: categories[0] || 'Food',
      unit: 'piece',
      buying_price: '',
      selling_price: '',
      is_active: 'yes',
    });
    sheet.getRow(3).eachCell((cell) => {
      cell.fill = guideFill;
      cell.font = { italic: true, size: 10, color: { argb: 'FF6B5B00' } };
    });

    sheet.addRow(EXAMPLE_ROW);
    sheet.getRow(4).font = { color: { argb: 'FF666666' } };

    // Category dropdown on column B (rows 2–2000)
    if (categories.length > 0) {
      sheet.dataValidations.add('B2:B2000', {
        type: 'list',
        allowBlank: true,
        formulae: [`"${categories.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Invalid category',
        error: `Choose one of: ${categories.join(', ')}`,
      });
    }

    sheet.dataValidations.add('F2:F2000', {
      type: 'whole',
      operator: 'greaterThanOrEqual',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid price',
      error: 'Enter a whole number (UGX).',
    });
    sheet.dataValidations.add('G2:G2000', {
      type: 'whole',
      operator: 'greaterThanOrEqual',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid price',
      error: 'Enter a whole number (UGX).',
    });
    sheet.dataValidations.add('L2:L2000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"yes,no"'],
      showErrorMessage: true,
      errorTitle: 'Invalid value',
      error: 'Use yes or no.',
    });

    const instructions = workbook.addWorksheet('Instructions');
    instructions.columns = [
      { header: 'Field', key: 'field', width: 22 },
      { header: 'Required', key: 'required', width: 10 },
      { header: 'Description', key: 'description', width: 72 },
    ];
    instructions.addRows([
      {
        field: 'Import rules',
        required: '—',
        description:
          'Only the Products sheet is imported. Rows starting with # GUIDE are ignored. Instructions / Allowed values sheets are never imported.',
      },
      { field: 'name', required: 'Yes', description: 'Product name as shown on receipts and POS.' },
      {
        field: 'category',
        required: 'No',
        description: `Must be one of: ${categories.join(', ')}. Use the dropdown in Excel. Leave blank for uncategorised.`,
      },
      { field: 'sku / barcode', required: 'No', description: 'Must be unique within your store if provided.' },
      {
        field: 'unit',
        required: 'No',
        description: `Common values: ${ALLOWED_UNITS.join(', ')}. Defaults to piece.`,
      },
      { field: 'buying_price', required: 'Yes', description: 'Cost price in UGX (whole shillings, no decimals).' },
      { field: 'selling_price', required: 'Yes', description: 'Shelf price in UGX. Must be ≥ buying price.' },
      { field: 'current_stock', required: 'No', description: 'Opening quantity on hand when creating the product. Defaults to 0.' },
      { field: 'minimum_stock', required: 'No', description: 'Low-stock alert level. Defaults to 5.' },
      {
        field: 'supplier_name',
        required: 'No',
        description: 'Matched to an existing supplier or created automatically.',
      },
      { field: 'expiry_date', required: 'No', description: 'YYYY-MM-DD for perishables / medicines. Leave blank if N/A.' },
      { field: 'is_active', required: 'No', description: 'yes or no. Defaults to yes.' },
    ]);
    instructions.getRow(1).font = { bold: true };

    const allowed = workbook.addWorksheet('Allowed values');
    allowed.columns = [
      { header: 'Categories (use exact spelling)', key: 'category', width: 24 },
      { header: 'Units (examples)', key: 'unit', width: 16 },
    ];
    const maxLen = Math.max(categories.length, ALLOWED_UNITS.length);
    for (let i = 0; i < maxLen; i += 1) {
      allowed.addRow({
        category: categories[i] || '',
        unit: ALLOWED_UNITS[i] || '',
      });
    }
    allowed.getRow(1).font = { bold: true };

    return workbook.xlsx.writeBuffer();
  }

  async parseWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Products') || workbook.worksheets[0];
    if (!sheet) throw new Error('No worksheet found in the uploaded file.');
    if (sheet.name !== 'Products' && workbook.getWorksheet('Products')) {
      throw new Error('Import reads the "Products" sheet only. Keep product rows on that sheet.');
    }

    const headerRow = sheet.getRow(1);
    const columnMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const key = normalizeHeader(cellValue(cell));
      if (key) columnMap[key] = colNumber;
    });

    if (!columnMap.name) {
      throw new Error('Template must include a "name" column in row 1.');
    }

    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (key) => {
        const col = columnMap[key];
        if (!col) return '';
        return cellValue(row.getCell(col));
      };

      const name = String(get('name') || '').trim();
      const buying_price = get('buying_price');
      if (isGuideRow(name, buying_price)) return;

      rows.push({
        rowNumber,
        name,
        category: String(get('category') || '').trim(),
        sku: String(get('sku') || '').trim() || null,
        barcode: String(get('barcode') || '').trim() || null,
        unit: String(get('unit') || 'piece').trim() || 'piece',
        buying_price,
        selling_price: get('selling_price'),
        current_stock: get('current_stock'),
        minimum_stock: get('minimum_stock'),
        supplier_name: String(get('supplier_name') || '').trim(),
        expiry_date: get('expiry_date'),
        is_active: get('is_active'),
      });
    });

    return rows;
  }

  async importProducts(rows, { businessId, businessType, userId }) {
    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      try {
        if (row.buying_price === '' || row.selling_price === '') {
          throw new Error('buying_price and selling_price are required.');
        }

        const priceCheck = assertSellingNotBelowCost(row.buying_price, row.selling_price);
        if (!priceCheck.ok) throw new Error(priceCheck.error);

        const normalizedCategory = row.category
          ? normalizeProductCategory(row.category, businessType)
          : null;
        if (row.category && !normalizedCategory) {
          throw new Error(
            `Invalid category "${row.category}". Use one of: ${getProductCategories(businessType).join(', ')}.`
          );
        }

        if (row.barcode) {
          const dup = await db
            .prepare(
              `SELECT id FROM products WHERE barcode = ? AND business_id = ? AND deleted_at IS NULL LIMIT 1`
            )
            .get(row.barcode, businessId);
          if (dup) throw new Error(`Barcode "${row.barcode}" already exists.`);
        }
        if (row.sku) {
          const dup = await db
            .prepare(`SELECT id FROM products WHERE sku = ? AND business_id = ? AND deleted_at IS NULL LIMIT 1`)
            .get(row.sku, businessId);
          if (dup) throw new Error(`SKU "${row.sku}" already exists.`);
        }

        const supplierId = await resolveSupplierId(row.supplier_name, businessId);
        const openingQty = Math.max(0, Number(row.current_stock) || 0);
        const minimumStock = Number(row.minimum_stock) || 5;
        const expiryDate = parseDate(row.expiry_date);
        const isActive = parseBool(row.is_active) ? 1 : 0;
        const productId = newId('prod');

        await db
          .prepare(
            `INSERT INTO products (
              id, name, barcode, sku, category, unit, buying_price, selling_price,
              tax_rate, current_stock, minimum_stock, supplier_id, expiry_date, is_active, business_id,
              created_at, updated_at, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')`
          )
          .run(
            productId,
            row.name,
            row.barcode,
            row.sku,
            normalizedCategory,
            row.unit,
            priceCheck.buy,
            priceCheck.sell,
            openingQty,
            minimumStock,
            supplierId,
            expiryDate,
            isActive,
            businessId
          );

        if (openingQty > 0) {
          await db
            .prepare(
              `INSERT INTO stock_adjustments (
                id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
                quantity_after, reason, supplier_id, cost_per_unit, business_id, created_at, sync_status
              ) VALUES (?, ?, ?, 'opening', 0, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')`
            )
            .run(
              newId('adj'),
              productId,
              userId,
              openingQty,
              openingQty,
              'Bulk import opening stock',
              supplierId,
              priceCheck.buy,
              businessId
            );
        }

        results.created += 1;
      } catch (err) {
        results.skipped += 1;
        results.errors.push({
          row: row.rowNumber,
          name: row.name,
          error: err.message || 'Import failed',
        });
      }
    }

    return results;
  }
}

module.exports = new ProductImportService();
