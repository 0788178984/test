-- Uganda Supermarket — PostgreSQL schema for Supabase
-- Run once in Supabase SQL Editor (or via psql) before importing data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Businesses (multi-tenant)
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_code TEXT NOT NULL UNIQUE,
  subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('active', 'trial', 'suspended', 'expired')),
  subscription_expires_at TIMESTAMPTZ,
  payment_config TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO businesses (id, name, business_code, subscription_status, subscription_expires_at)
VALUES ('biz-default', 'Default Store', 'DEFAULT', 'active', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  pin TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('developer', 'admin', 'manager', 'cashier')),
  business_id TEXT REFERENCES businesses(id),
  is_active INTEGER DEFAULT 1,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ,
  CHECK (
    (role = 'developer' AND business_id IS NULL) OR
    (role != 'developer' AND business_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tin_number TEXT,
  payment_terms TEXT,
  notes TEXT,
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  category TEXT,
  unit TEXT DEFAULT 'piece',
  buying_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  selling_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_rate DOUBLE PRECISION DEFAULT 0.18,
  current_stock DOUBLE PRECISION DEFAULT 0,
  minimum_stock DOUBLE PRECISION DEFAULT 5,
  supplier_id TEXT REFERENCES suppliers(id),
  expiry_date TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  loyalty_points INTEGER DEFAULT 0,
  total_spent DOUBLE PRECISION DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  last_visit TIMESTAMPTZ,
  notes TEXT,
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sale_number TEXT NOT NULL,
  cashier_id TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT REFERENCES customers(id),
  subtotal DOUBLE PRECISION NOT NULL,
  discount_amount DOUBLE PRECISION DEFAULT 0,
  discount_reason TEXT,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  total_amount DOUBLE PRECISION NOT NULL,
  amount_paid DOUBLE PRECISION NOT NULL,
  change_given DOUBLE PRECISION DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel_money', 'mixed')),
  payment_reference TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
  receipt_printed INTEGER DEFAULT 0,
  receipt_sms_sent INTEGER DEFAULT 0,
  receipt_whatsapp_sent INTEGER DEFAULT 0,
  notes TEXT,
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ,
  UNIQUE (sale_number, business_id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  buying_price DOUBLE PRECISION NOT NULL,
  discount_percent DOUBLE PRECISION DEFAULT 0,
  line_total DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('restock', 'damage', 'return', 'correction', 'opening')),
  quantity_before DOUBLE PRECISION NOT NULL,
  quantity_change DOUBLE PRECISION NOT NULL,
  quantity_after DOUBLE PRECISION NOT NULL,
  reason TEXT,
  supplier_id TEXT REFERENCES suppliers(id),
  cost_per_unit DOUBLE PRECISION,
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'danger', 'success')),
  target_role TEXT,
  target_user_id TEXT REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  sender_user_id TEXT REFERENCES users(id),
  is_read INTEGER DEFAULT 0,
  channels TEXT DEFAULT '[]',
  sent_via TEXT DEFAULT '[]',
  meta TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  sale_id TEXT REFERENCES sales(id),
  points_change INTEGER NOT NULL,
  reason TEXT,
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'other')),
  expense_date TEXT NOT NULL,
  notes TEXT,
  receipt_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mobile_money_transactions (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  business_id TEXT REFERENCES businesses(id),
  reference TEXT,
  method TEXT NOT NULL,
  phone TEXT,
  amount DOUBLE PRECISION,
  status TEXT,
  provider_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  from_user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  developer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_email
  ON users (business_id, lower(trim(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL AND role != 'developer';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_developer_email
  ON users (lower(trim(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL AND role = 'developer';

CREATE INDEX IF NOT EXISTS idx_products_business ON products (business_id);
CREATE INDEX IF NOT EXISTS idx_sales_business ON sales (business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers (business_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers (business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications (business_id);
CREATE INDEX IF NOT EXISTS idx_support_business ON support_requests (business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON expenses (business_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses (business_id);

INSERT INTO settings (key, value, updated_at) VALUES
  ('store_name', 'My Supermarket', NOW()),
  ('store_address', 'Kampala, Uganda', NOW()),
  ('store_phone', '+256700000000', NOW()),
  ('store_tin', '', NOW()),
  ('currency', 'UGX', NOW()),
  ('loyalty_rate', '0.01', NOW()),
  ('vat_rate', '0.18', NOW()),
  ('receipt_footer', 'Thank you for shopping with us!', NOW()),
  ('low_stock_notify_roles', '["admin","manager"]', NOW()),
  ('sync_interval_seconds', '60', NOW()),
  ('cloud_api_url', '', NOW()),
  ('africastalking_username', '', NOW()),
  ('africastalking_api_key', '', NOW()),
  ('whatsapp_token', '', NOW()),
  ('whatsapp_phone_id', '', NOW()),
  ('mtn_momo_url', 'https://sandbox.momodeveloper.mtn.com', NOW()),
  ('airtel_momo_url', 'https://openapi.airtel.africa', NOW())
ON CONFLICT (key) DO NOTHING;
