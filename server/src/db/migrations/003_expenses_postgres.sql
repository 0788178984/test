-- Daily expenses (money out) — run once in Supabase or auto-applied on server start

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

CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON expenses (business_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses (business_id);
