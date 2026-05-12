-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  pin TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','cashier')),
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TEXT
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tin_number TEXT,
  payment_terms TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TEXT
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  sku TEXT UNIQUE,
  category TEXT,
  unit TEXT DEFAULT 'piece',
  buying_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  tax_rate REAL DEFAULT 0.18,
  current_stock REAL DEFAULT 0,
  minimum_stock REAL DEFAULT 5,
  supplier_id TEXT,
  expiry_date TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TEXT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  loyalty_points INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  last_visit TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TEXT
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sale_number TEXT UNIQUE NOT NULL,
  cashier_id TEXT NOT NULL,
  customer_id TEXT,
  subtotal REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  discount_reason TEXT,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  amount_paid REAL NOT NULL,
  change_given REAL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','mtn_momo','airtel_money','mixed')),
  payment_reference TEXT,
  status TEXT DEFAULT 'completed' CHECK(status IN ('completed','voided','refunded')),
  receipt_printed INTEGER DEFAULT 0,
  receipt_sms_sent INTEGER DEFAULT 0,
  receipt_whatsapp_sent INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  deleted_at TEXT,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  buying_price REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  line_total REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Stock adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('restock','damage','return','correction','opening')),
  quantity_before REAL NOT NULL,
  quantity_change REAL NOT NULL,
  quantity_after REAL NOT NULL,
  reason TEXT,
  supplier_id TEXT,
  cost_per_unit REAL,
  created_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL CHECK(type IN (
    'low_stock','expiry_warning','expiry_expired',
    'sale_completed','daily_summary','sync_completed',
    'sync_failed','momo_payment','login_alert',
    'void_sale','discount_approval'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','danger','success')),
  target_role TEXT,
  target_user_id TEXT,
  is_read INTEGER DEFAULT 0,
  channels TEXT DEFAULT '[]',
  sent_via TEXT DEFAULT '[]',
  meta TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  FOREIGN KEY (target_user_id) REFERENCES users(id)
);

-- Loyalty transactions table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  points_change INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sync_status TEXT DEFAULT 'pending',
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO settings VALUES ('store_name', 'My Supermarket', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('store_address', 'Kampala, Uganda', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('store_phone', '+256700000000', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('store_tin', '', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('currency', 'UGX', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('loyalty_rate', '0.01', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('vat_rate', '0.18', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('receipt_footer', 'Thank you for shopping with us!', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('low_stock_notify_roles', '["admin","manager"]', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('sync_interval_seconds', '60', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('cloud_api_url', '', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('africastalking_username', '', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('africastalking_api_key', '', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('whatsapp_token', '', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('whatsapp_phone_id', '', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('mtn_momo_url', 'https://sandbox.momodeveloper.mtn.com', datetime('now'));
INSERT OR IGNORE INTO settings VALUES ('airtel_momo_url', 'https://openapi.airtel.africa', datetime('now'));
