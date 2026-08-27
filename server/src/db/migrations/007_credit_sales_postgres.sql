-- Credit sales, receivables, cart audit (Marg ERP-style)
-- Applied automatically on server start via schemaPatches.js

ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DOUBLE PRECISION DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_balance DOUBLE PRECISION DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_enabled INTEGER DEFAULT 0;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'retail';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS balance_due DOUBLE PRECISION DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS credit_due_date TEXT;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_wholesale INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS customer_payments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  sale_id TEXT REFERENCES sales(id),
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel_money', 'bank', 'other')),
  payment_reference TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS cart_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  product_name TEXT,
  quantity DOUBLE PRECISION,
  line_amount DOUBLE PRECISION,
  cart_total DOUBLE PRECISION,
  meta TEXT DEFAULT '{}',
  business_id TEXT REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status, business_id);
CREATE INDEX IF NOT EXISTS idx_sales_balance_due ON sales(balance_due) WHERE balance_due > 0;
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_sale ON customer_payments(sale_id);
