-- Mobile money agent float & balancing (in-store agent banking, separate from POS MoMo collection)

CREATE TABLE IF NOT EXISTS agent_float_sessions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  cashier_id TEXT NOT NULL REFERENCES users(id),
  session_date TEXT NOT NULL,
  opening_cash DOUBLE PRECISION NOT NULL DEFAULT 0,
  opening_float DOUBLE PRECISION NOT NULL DEFAULT 0,
  closing_cash_actual DOUBLE PRECISION,
  closing_float_actual DOUBLE PRECISION,
  cash_variance DOUBLE PRECISION DEFAULT 0,
  float_variance DOUBLE PRECISION DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, cashier_id, session_date)
);

CREATE TABLE IF NOT EXISTS agent_transactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_float_sessions(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  cashier_id TEXT NOT NULL REFERENCES users(id),
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN ('withdrawal', 'deposit', 'airtime', 'bill_payment', 'send_money')
  ),
  network TEXT NOT NULL CHECK (network IN ('mtn', 'airtel')),
  amount DOUBLE PRECISION NOT NULL,
  commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  cash_delta DOUBLE PRECISION NOT NULL,
  float_delta DOUBLE PRECISION NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_business_date ON agent_float_sessions (business_id, session_date);
CREATE INDEX IF NOT EXISTS idx_agent_tx_session ON agent_transactions (session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tx_business_created ON agent_transactions (business_id, created_at);
