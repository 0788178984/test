-- =============================================================================
-- SuperMKT — Demo data for Supabase (run in SQL Editor AFTER 001_init_postgres.sql)
-- =============================================================================
-- Login after this seed:
--   Store code: DEFAULT
--   Developer (web): developer@supermarket.ug / Developer2026!
--   Admin PIN: 1234  |  Manager: 5678  |  Cashier: 9012
--   Staff web password (all): SuperMkt2024!
-- =============================================================================

-- Clear existing rows (safe re-run)
TRUNCATE TABLE
  loyalty_transactions,
  sale_items,
  sales,
  stock_adjustments,
  notifications,
  customers,
  products,
  suppliers,
  support_requests,
  mobile_money_transactions,
  users
RESTART IDENTITY CASCADE;

DELETE FROM businesses WHERE id != 'biz-default';

INSERT INTO businesses (id, name, business_code, subscription_status, subscription_expires_at)
VALUES ('biz-default', 'Default Store', 'DEFAULT', 'active', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_code = EXCLUDED.business_code,
  subscription_status = EXCLUDED.subscription_status;

-- bcrypt hashes (cost 12) — matches server/src/db/seed.js
INSERT INTO users (id, name, email, phone, pin, password_hash, role, business_id, is_active) VALUES
  ('dev-system-001', 'System Developer', 'developer@supermarket.ug', NULL,
   '$2a$12$UH7bMUv3gbDimPUPAPa.HODJcuOKQNtZXRMNA01MroexfxGTCmNfG',
   '$2a$12$gIyhdA0p../N05X6oTsmRu0gLhpl3G0qwDqZcp//tQ2TPJ96iCWwO',
   'developer', NULL, 1),
  ('admin-001', 'Admin User', 'admin@supermarket.ug', '+256700123456',
   '$2a$12$/ZD7z81hXv83ovRQrKhoD.Ht6muHUU5zoLtVJoKxaDsHW35VFu3Ky',
   '$2a$12$lgBBBSFYX/pVOSTgptyh0eFWbSwrjDxHYZ/3I62AuxtJucH4Jq3Ji',
   'admin', 'biz-default', 1),
  ('manager-001', 'John Okello', 'manager@supermarket.ug', '+256700123457',
   '$2a$12$jbyw.4x99na2vHJmykPGkO0kRmgcRkpc2Em2hTUcAPvHjkcMicjsO',
   '$2a$12$lgBBBSFYX/pVOSTgptyh0eFWbSwrjDxHYZ/3I62AuxtJucH4Jq3Ji',
   'manager', 'biz-default', 1),
  ('cashier-001', 'Sarah Nakato', 'cashier@supermarket.ug', '+256700123458',
   '$2a$12$s2lGv1znb.jmLsvSmjxQQeFnPU8QjqeGayr8XVFpv3s32bRR9.cPS',
   '$2a$12$lgBBBSFYX/pVOSTgptyh0eFWbSwrjDxHYZ/3I62AuxtJucH4Jq3Ji',
   'cashier', 'biz-default', 1);

INSERT INTO suppliers (id, name, contact_name, phone, email, address, tin_number, payment_terms, business_id) VALUES
  ('supplier-001', 'Uganda Sugar Corporation', 'Peter Mukasa', '+256700234567', 'orders@ugandasugar.co.ug', 'Kampala Industrial Area', '1001234567', '30 days', 'biz-default'),
  ('supplier-002', 'Nile Breweries Limited', 'Grace Auma', '+256700234568', 'supply@nilebreweries.co.ug', 'Jinja, Uganda', '1001234568', '14 days', 'biz-default');

INSERT INTO products (id, name, barcode, sku, category, unit, buying_price, selling_price, current_stock, minimum_stock, supplier_id, business_id) VALUES
  ('product-001', 'Sugar (loose, per kg)', '1234567890123', 'SUG-LOOSE', 'Food', 'kg', 1600, 1850, 200, 20, 'supplier-001', 'biz-default'),
  ('product-002', 'Cooking Oil 1L', '1234567890124', 'OIL-001', 'Food', 'litre', 7500, 8500, 30, 5, 'supplier-001', 'biz-default'),
  ('product-003', 'Bread (loaf)', '1234567890125', 'BRD-001', 'Bakery', 'piece', 2800, 3000, 20, 8, NULL, 'biz-default'),
  ('product-004', 'Nile Special Beer 500ml', '1234567890126', 'BEER-NS-500', 'Beverages', 'piece', 3200, 4000, 100, 20, 'supplier-002', 'biz-default'),
  ('product-005', 'Rice (loose, per kg)', '1234567890127', 'RICE-LOOSE', 'Food', 'kg', 3500, 4000, 75, 10, 'supplier-001', 'biz-default');

INSERT INTO customers (id, name, phone, email, loyalty_points, total_spent, visit_count, business_id) VALUES
  ('customer-001', 'David Muwanga', '+256700345678', 'david.muwanga@email.com', 150, 250000, 12, 'biz-default'),
  ('customer-002', 'Grace Nankinga', '+256700345679', 'grace.n@email.com', 80, 120000, 8, 'biz-default');

INSERT INTO sales (id, sale_number, cashier_id, customer_id, subtotal, discount_amount, tax_amount, total_amount, amount_paid, change_given, payment_method, payment_reference, business_id, status) VALUES
  ('sale-001', 'INV-2024-000001', 'cashier-001', 'customer-001', 15200, 0, 2736, 17936, 18000, 64, 'cash', NULL, 'biz-default', 'completed'),
  ('sale-002', 'INV-2024-000002', 'cashier-001', 'customer-002', 8500, 425, 1455, 9530, 9530, 0, 'mtn_momo', 'MP241201123456', 'biz-default', 'completed');

INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, buying_price, line_total) VALUES
  ('item-001', 'sale-001', 'product-001', 'Sugar 2kg', 2, 3700, 3200, 7400),
  ('item-002', 'sale-001', 'product-002', 'Cooking Oil 1L', 1, 8500, 7500, 8500),
  ('item-003', 'sale-002', 'product-003', 'Bread (loaf)', 2, 3000, 2800, 6000),
  ('item-004', 'sale-002', 'product-004', 'Nile Special Beer 500ml', 1, 4000, 3200, 4000);

INSERT INTO loyalty_transactions (id, customer_id, sale_id, points_change, reason, business_id) VALUES
  ('loyalty-001', 'customer-001', 'sale-001', 179, 'Purchase of UGX 17,936', 'biz-default'),
  ('loyalty-002', 'customer-002', 'sale-002', 95, 'Purchase of UGX 9,530', 'biz-default');

-- Quick check
SELECT 'users' AS tbl, COUNT(*)::int AS rows FROM users
UNION ALL SELECT 'products', COUNT(*)::int FROM products
UNION ALL SELECT 'sales', COUNT(*)::int FROM sales
UNION ALL SELECT 'customers', COUNT(*)::int FROM customers;
