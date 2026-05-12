const db = require('./connection');
const bcrypt = require('bcryptjs');
const { DEFAULT_BUSINESS_ID } = require('./multiTenantMigrate');

async function seedDatabase() {
  console.log('Seeding database...');

  db.exec(`
    DELETE FROM support_requests;
    DELETE FROM loyalty_transactions;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM stock_adjustments;
    DELETE FROM notifications;
    DELETE FROM customers;
    DELETE FROM products;
    DELETE FROM suppliers;
    DELETE FROM users;
  `);

  db.prepare(
    `
    INSERT OR IGNORE INTO businesses (id, name, business_code, subscription_status, subscription_expires_at)
    VALUES (?, 'Default Store', 'DEFAULT', 'active', NULL)
  `
  ).run(DEFAULT_BUSINESS_ID);

  const bizId = DEFAULT_BUSINESS_ID;
  const adminPin = await bcrypt.hash('1234', 12);
  const managerPin = await bcrypt.hash('5678', 12);
  const cashierPin = await bcrypt.hash('9012', 12);
  // Same web password for all seeded users (PIN login unchanged)
  const webPasswordHash = await bcrypt.hash('SuperMkt2024!', 12);

  const devPassword = process.env.DEVELOPER_PASSWORD || 'Developer2026!';
  const devPasswordHash = await bcrypt.hash(devPassword, 12);
  const devPin = await bcrypt.hash('0000', 12);

  db.prepare(
    `
    INSERT INTO users (id, name, email, phone, pin, password_hash, role, business_id, is_active, created_at, updated_at, sync_status)
    VALUES ('dev-system-001', 'System Developer', 'developer@supermarket.ug', NULL, ?, ?, 'developer', NULL, 1, datetime('now'), datetime('now'), 'pending')
  `
  ).run(devPin, devPasswordHash);

  const users = [
    {
      id: 'admin-001',
      name: 'Admin User',
      email: 'admin@supermarket.ug',
      phone: '+256700123456',
      pin: adminPin,
      password_hash: webPasswordHash,
      role: 'admin',
      is_active: 1
    },
    {
      id: 'manager-001',
      name: 'John Okello',
      email: 'manager@supermarket.ug',
      phone: '+256700123457',
      pin: managerPin,
      password_hash: webPasswordHash,
      role: 'manager',
      is_active: 1
    },
    {
      id: 'cashier-001',
      name: 'Sarah Nakato',
      email: 'cashier@supermarket.ug',
      phone: '+256700123458',
      pin: cashierPin,
      password_hash: webPasswordHash,
      role: 'cashier',
      is_active: 1
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, phone, pin, password_hash, role, business_id, is_active, created_at, updated_at, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
  `);

  users.forEach((user) =>
    insertUser.run(
      user.id,
      user.name,
      user.email,
      user.phone,
      user.pin,
      user.password_hash,
      user.role,
      bizId,
      user.is_active
    )
  );

  // Insert suppliers
  const suppliers = [
    {
      id: 'supplier-001',
      name: 'Uganda Sugar Corporation',
      contact_name: 'Peter Mukasa',
      phone: '+256700234567',
      email: 'orders@ugandasugar.co.ug',
      address: 'Kampala Industrial Area',
      tin_number: '1001234567',
      payment_terms: '30 days'
    },
    {
      id: 'supplier-002',
      name: 'Nile Breweries Limited',
      contact_name: 'Grace Auma',
      phone: '+256700234568',
      email: 'supply@nilebreweries.co.ug',
      address: 'Jinja, Uganda',
      tin_number: '1001234568',
      payment_terms: '14 days'
    }
  ];

  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (id, name, contact_name, phone, email, address, tin_number, payment_terms, business_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  suppliers.forEach((supplier) =>
    insertSupplier.run(
      supplier.id,
      supplier.name,
      supplier.contact_name,
      supplier.phone,
      supplier.email,
      supplier.address,
      supplier.tin_number,
      supplier.payment_terms,
      bizId
    )
  );

  // Insert products
  const products = [
    {
      id: 'product-001',
      name: 'Sugar (loose, per kg)',
      barcode: '1234567890123',
      sku: 'SUG-LOOSE',
      category: 'Food',
      unit: 'kg',
      buying_price: 1600,
      selling_price: 1850,
      current_stock: 200,
      minimum_stock: 20,
      supplier_id: 'supplier-001'
    },
    {
      id: 'product-002',
      name: 'Cooking Oil 1L',
      barcode: '1234567890124',
      sku: 'OIL-001',
      category: 'Food',
      unit: 'litre',
      buying_price: 7500,
      selling_price: 8500,
      current_stock: 30,
      minimum_stock: 5,
      supplier_id: 'supplier-001'
    },
    {
      id: 'product-003',
      name: 'Bread (loaf)',
      barcode: '1234567890125',
      sku: 'BRD-001',
      category: 'Bakery',
      unit: 'piece',
      buying_price: 2800,
      selling_price: 3000,
      current_stock: 20,
      minimum_stock: 8,
      supplier_id: null
    },
    {
      id: 'product-004',
      name: 'Nile Special Beer 500ml',
      barcode: '1234567890126',
      sku: 'BEER-NS-500',
      category: 'Beverages',
      unit: 'piece',
      buying_price: 3200,
      selling_price: 4000,
      current_stock: 100,
      minimum_stock: 20,
      supplier_id: 'supplier-002'
    },
    {
      id: 'product-005',
      name: 'Rice (loose, per kg)',
      barcode: '1234567890127',
      sku: 'RICE-LOOSE',
      category: 'Food',
      unit: 'kg',
      buying_price: 3500,
      selling_price: 4000,
      current_stock: 75,
      minimum_stock: 10,
      supplier_id: 'supplier-001'
    }
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, barcode, sku, category, unit, buying_price, selling_price,
                         current_stock, minimum_stock, supplier_id, business_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  products.forEach((product) =>
    insertProduct.run(
      product.id,
      product.name,
      product.barcode,
      product.sku,
      product.category,
      product.unit,
      product.buying_price,
      product.selling_price,
      product.current_stock,
      product.minimum_stock,
      product.supplier_id,
      bizId
    )
  );

  // Insert customers
  const customers = [
    {
      id: 'customer-001',
      name: 'David Muwanga',
      phone: '+256700345678',
      email: 'david.muwanga@email.com',
      loyalty_points: 150,
      total_spent: 250000,
      visit_count: 12
    },
    {
      id: 'customer-002',
      name: 'Grace Nankinga',
      phone: '+256700345679',
      email: 'grace.n@email.com',
      loyalty_points: 80,
      total_spent: 120000,
      visit_count: 8
    }
  ];

  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, name, phone, email, loyalty_points, total_spent, visit_count, business_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  customers.forEach((customer) =>
    insertCustomer.run(
      customer.id,
      customer.name,
      customer.phone,
      customer.email,
      customer.loyalty_points,
      customer.total_spent,
      customer.visit_count,
      bizId
    )
  );

  // Insert sample sales
  const sales = [
    {
      id: 'sale-001',
      sale_number: 'INV-2024-000001',
      cashier_id: 'cashier-001',
      customer_id: 'customer-001',
      subtotal: 15200,
      discount_amount: 0,
      tax_amount: 2736,
      total_amount: 17936,
      amount_paid: 18000,
      change_given: 64,
      payment_method: 'cash'
    },
    {
      id: 'sale-002',
      sale_number: 'INV-2024-000002',
      cashier_id: 'cashier-001',
      customer_id: 'customer-002',
      subtotal: 8500,
      discount_amount: 425,
      tax_amount: 1455,
      total_amount: 9530,
      amount_paid: 9530,
      change_given: 0,
      payment_method: 'mtn_momo',
      payment_reference: 'MP241201123456'
    }
  ];

  const insertSale = db.prepare(`
    INSERT INTO sales (id, sale_number, cashier_id, customer_id, subtotal, discount_amount,
                      tax_amount, total_amount, amount_paid, change_given, payment_method,
                      payment_reference, business_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  sales.forEach((sale) =>
    insertSale.run(
      sale.id,
      sale.sale_number,
      sale.cashier_id,
      sale.customer_id,
      sale.subtotal,
      sale.discount_amount,
      sale.tax_amount,
      sale.total_amount,
      sale.amount_paid,
      sale.change_given,
      sale.payment_method,
      sale.payment_reference || null,
      bizId
    )
  );

  // Insert sale items
  const saleItems = [
    {
      id: 'item-001',
      sale_id: 'sale-001',
      product_id: 'product-001',
      product_name: 'Sugar 2kg',
      quantity: 2,
      unit_price: 3700,
      buying_price: 3200,
      line_total: 7400
    },
    {
      id: 'item-002',
      sale_id: 'sale-001',
      product_id: 'product-002',
      product_name: 'Cooking Oil 1L',
      quantity: 1,
      unit_price: 8500,
      buying_price: 7500,
      line_total: 8500
    },
    {
      id: 'item-003',
      sale_id: 'sale-002',
      product_id: 'product-003',
      product_name: 'Bread (loaf)',
      quantity: 2,
      unit_price: 3000,
      buying_price: 2800,
      line_total: 6000
    },
    {
      id: 'item-004',
      sale_id: 'sale-002',
      product_id: 'product-004',
      product_name: 'Nile Special Beer 500ml',
      quantity: 1,
      unit_price: 4000,
      buying_price: 3200,
      line_total: 4000
    }
  ];

  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, 
                           buying_price, line_total, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  saleItems.forEach(item => 
    insertSaleItem.run(item.id, item.sale_id, item.product_id, item.product_name,
                       item.quantity, item.unit_price, item.buying_price, item.line_total)
  );

  // Insert loyalty transactions
  const loyaltyTransactions = [
    {
      id: 'loyalty-001',
      customer_id: 'customer-001',
      sale_id: 'sale-001',
      points_change: 179,
      reason: 'Purchase of UGX 17,936'
    },
    {
      id: 'loyalty-002',
      customer_id: 'customer-002',
      sale_id: 'sale-002',
      points_change: 95,
      reason: 'Purchase of UGX 9,530'
    }
  ];

  const insertLoyalty = db.prepare(`
    INSERT INTO loyalty_transactions (id, customer_id, sale_id, points_change, reason, business_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  loyaltyTransactions.forEach((tx) =>
    insertLoyalty.run(tx.id, tx.customer_id, tx.sale_id, tx.points_change, tx.reason, bizId)
  );

  console.log('Database seeded successfully!');
  console.log('Store business code: DEFAULT (enter on login when prompted)');
  console.log('Developer (web only): developer@supermarket.ug /', devPassword);
  console.log('Admin PIN 1234 · Manager 5678 · Cashier 9012');
  console.log('Staff web password: SuperMkt2024!');
}

if (require.main === module) {
  seedDatabase().catch(console.error);
}

module.exports = seedDatabase;
