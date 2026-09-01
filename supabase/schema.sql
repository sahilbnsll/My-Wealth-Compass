-- ============================================================================
-- Sahil's Finance Intelligence — Complete Database Setup Script
-- Paste this directly into your Supabase SQL Editor to initialize a fresh database
-- ============================================================================

-- 1. Helper function for updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. User Profile (singleton)
CREATE TABLE IF NOT EXISTS public.profile (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  current_age NUMERIC,
  retirement_age NUMERIC,
  planning_age NUMERIC,
  monthly_income NUMERIC,
  annual_bonus NUMERIC,
  monthly_expenses NUMERIC,
  essential_monthly_expenses NUMERIC,
  existing_cash NUMERIC,
  existing_debt NUMERIC,
  dependents INTEGER,
  job_stability TEXT,
  expected_salary_growth NUMERIC,
  risk_tolerance TEXT,
  investment_horizon_years NUMERIC,
  tax_regime TEXT,
  location TEXT,
  emergency_months_target NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.profile TO service_role;
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS profile_updated ON public.profile;
CREATE TRIGGER profile_updated BEFORE UPDATE ON public.profile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Holdings (Investments, EPF, PPF, Real Estate, etc.)
CREATE TABLE IF NOT EXISTS public.holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_class TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT,
  isin TEXT,
  category TEXT,
  quantity NUMERIC,
  avg_price NUMERIC,
  current_price NUMERIC,
  current_value NUMERIC,
  price_source TEXT NOT NULL DEFAULT 'manual',
  price_updated_at TIMESTAMPTZ,
  purchase_date DATE,
  maturity_date DATE,
  interest_rate NUMERIC,
  cost_basis NUMERIC,
  target_allocation_pct NUMERIC,
  tax_treatment TEXT,
  liquidity TEXT,
  sector TEXT,
  cap_segment TEXT,
  geography TEXT DEFAULT 'india',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.holdings TO service_role;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS holdings_updated ON public.holdings;
CREATE TRIGGER holdings_updated BEFORE UPDATE ON public.holdings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Planned Investments (SIPs, Recurring Deposits, Annual Contributions)
CREATE TABLE IF NOT EXISTS public.planned_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT,
  isin TEXT,
  asset_class TEXT NOT NULL,
  instrument_type TEXT,
  monthly_amount NUMERIC NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE,
  end_date DATE,
  annual_step_up_pct NUMERIC NOT NULL DEFAULT 0,
  expected_return_pct NUMERIC,
  objective TEXT,
  risk_level TEXT,
  liquidity TEXT,
  tax_treatment TEXT,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.planned_investments TO service_role;
ALTER TABLE public.planned_investments ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS planned_updated ON public.planned_investments;
CREATE TRIGGER planned_updated BEFORE UPDATE ON public.planned_investments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Financial Goals
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  current_cost NUMERIC NOT NULL DEFAULT 0,
  target_date DATE,
  inflation_pct NUMERIC,
  current_savings NUMERIC NOT NULL DEFAULT 0,
  expected_return_pct NUMERIC,
  equity_allocation_pct NUMERIC,
  priority TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS goals_updated ON public.goals;
CREATE TRIGGER goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Planning Assumptions
CREATE TABLE IF NOT EXISTS public.assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'base',
  value NUMERIC NOT NULL,
  unit TEXT,
  rationale TEXT,
  source TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, scenario)
);
GRANT ALL ON public.assumptions TO service_role;
ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS assumptions_updated ON public.assumptions;
CREATE TRIGGER assumptions_updated BEFORE UPDATE ON public.assumptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Market Data (AMFI NAVs, Stock Quotes, FX, Rates)
CREATE TABLE IF NOT EXISTS public.market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  label TEXT,
  value NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  data_date DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'public',
  freshness TEXT NOT NULL DEFAULT 'eod',
  confidence TEXT NOT NULL DEFAULT 'medium',
  note TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.market_data TO service_role;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS market_data_updated ON public.market_data;
CREATE TRIGGER market_data_updated BEFORE UPDATE ON public.market_data FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Portfolio Snapshots (Daily History)
CREATE TABLE IF NOT EXISTS public.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_on DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value NUMERIC NOT NULL DEFAULT 0,
  invested NUMERIC NOT NULL DEFAULT 0,
  unrealised_gain NUMERIC NOT NULL DEFAULT 0,
  allocation JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS snapshots_taken_on_key ON public.snapshots (taken_on);
GRANT ALL ON public.snapshots TO service_role;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

-- 9. App Settings (Gate passcode, Notion, AI configurations)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS app_settings_updated ON public.app_settings;
CREATE TRIGGER app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. Transactions Ledger (Buys, Sells, Dividends, Cashflows)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  trade_date DATE NOT NULL DEFAULT CURRENT_DATE,
  settlement_date DATE,
  name TEXT NOT NULL,
  symbol TEXT,
  isin TEXT,
  asset_class TEXT NOT NULL DEFAULT 'equity',
  instrument_type TEXT NOT NULL DEFAULT 'other',
  quantity NUMERIC,
  price NUMERIC,
  amount NUMERIC NOT NULL DEFAULT 0,
  fees NUMERIC NOT NULL DEFAULT 0,
  taxes NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_id_key ON public.transactions (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_trade_date_idx ON public.transactions (trade_date DESC);
CREATE INDEX IF NOT EXISTS transactions_holding_idx ON public.transactions (holding_id);
DROP TRIGGER IF EXISTS transactions_set_updated_at ON public.transactions;
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 11. Watchlist (Track instruments before investing)
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT,
  isin TEXT,
  scheme_code TEXT,
  asset_class TEXT NOT NULL DEFAULT 'equity',
  instrument_type TEXT,
  quote_source TEXT,
  last_price NUMERIC,
  price_currency TEXT NOT NULL DEFAULT 'INR',
  price_updated_at TIMESTAMPTZ,
  reference_price NUMERIC,
  reference_set_on DATE,
  target_buy_price NUMERIC,
  thesis TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS watchlist_updated ON public.watchlist;
CREATE TRIGGER watchlist_updated BEFORE UPDATE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. Financial Calendar Events
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  event_date DATE NOT NULL,
  amount NUMERIC,
  recurrence TEXT NOT NULL DEFAULT 'none',
  notes TEXT,
  completed_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS calendar_events_updated ON public.calendar_events;
CREATE TRIGGER calendar_events_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 13. Periodic Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL UNIQUE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_value NUMERIC,
  invested NUMERIC,
  open_actions INTEGER NOT NULL DEFAULT 0,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS reviews_updated ON public.reviews;
CREATE TRIGGER reviews_updated BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. Workspace Access Policies (Single-user private workspace)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Allow workspace access to profile" ON public.profile;
CREATE POLICY "Allow workspace access to profile" ON public.profile FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to holdings" ON public.holdings;
CREATE POLICY "Allow workspace access to holdings" ON public.holdings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to planned investments" ON public.planned_investments;
CREATE POLICY "Allow workspace access to planned investments" ON public.planned_investments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to goals" ON public.goals;
CREATE POLICY "Allow workspace access to goals" ON public.goals FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to assumptions" ON public.assumptions;
CREATE POLICY "Allow workspace access to assumptions" ON public.assumptions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to market data" ON public.market_data;
CREATE POLICY "Allow workspace access to market data" ON public.market_data FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to snapshots" ON public.snapshots;
CREATE POLICY "Allow workspace access to snapshots" ON public.snapshots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to app settings" ON public.app_settings;
CREATE POLICY "Allow workspace access to app settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to transactions" ON public.transactions;
CREATE POLICY "Allow workspace access to transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to watchlist" ON public.watchlist;
CREATE POLICY "Allow workspace access to watchlist" ON public.watchlist FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to calendar events" ON public.calendar_events;
CREATE POLICY "Allow workspace access to calendar events" ON public.calendar_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow workspace access to reviews" ON public.reviews;
CREATE POLICY "Allow workspace access to reviews" ON public.reviews FOR ALL USING (true) WITH CHECK (true);


-- 15. Snapshot calculation function
CREATE OR REPLACE FUNCTION public.capture_portfolio_snapshot()
RETURNS TABLE (snapshot_day date, snapshot_total numeric, snapshot_invested numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  v_invested numeric := 0;
  v_alloc jsonb := '{}'::jsonb;
  v_day date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_count integer := 0;
BEGIN
  WITH valued AS (
    SELECT
      h.asset_class AS ac,
      CASE
        WHEN h.instrument_type IN ('stock','etf','mutual_fund','gold','silver')
          THEN COALESCE(h.quantity,0) * COALESCE(h.current_price,0)
        ELSE COALESCE(h.current_value,0)
      END AS val,
      COALESCE(
        h.cost_basis,
        CASE
          WHEN h.instrument_type IN ('stock','etf','mutual_fund','gold','silver')
            THEN COALESCE(h.quantity,0) * COALESCE(h.avg_price,0)
          ELSE COALESCE(h.current_value,0)
        END
      ) AS inv
    FROM public.holdings h
  )
  SELECT COALESCE(SUM(v.val),0), COALESCE(SUM(v.inv),0), COUNT(*)
  INTO v_total, v_invested, v_count
  FROM valued v;

  IF v_total > 0 THEN
    WITH valued AS (
      SELECT
        h.asset_class AS ac,
        CASE
          WHEN h.instrument_type IN ('stock','etf','mutual_fund','gold','silver')
            THEN COALESCE(h.quantity,0) * COALESCE(h.current_price,0)
          ELSE COALESCE(h.current_value,0)
        END AS val
      FROM public.holdings h
    ),
    per_class AS (
      SELECT v.ac, SUM(v.val) AS val FROM valued v GROUP BY v.ac
    )
    SELECT COALESCE(jsonb_object_agg(p.ac, ROUND((p.val / v_total) * 100, 4)), '{}'::jsonb)
    INTO v_alloc
    FROM per_class p;
  END IF;

  INSERT INTO public.snapshots (taken_on, total_value, invested, unrealised_gain, allocation, payload)
  VALUES (
    v_day,
    ROUND(v_total, 2),
    ROUND(v_invested, 2),
    ROUND(v_total - v_invested, 2),
    v_alloc,
    jsonb_build_object('holdings', v_count, 'captured_by', 'scheduled_job')
  )
  ON CONFLICT (taken_on) DO UPDATE SET
    total_value = EXCLUDED.total_value,
    invested = EXCLUDED.invested,
    unrealised_gain = EXCLUDED.unrealised_gain,
    allocation = EXCLUDED.allocation,
    payload = EXCLUDED.payload;

  RETURN QUERY SELECT v_day, ROUND(v_total, 2), ROUND(v_invested, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.capture_portfolio_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_portfolio_snapshot() TO service_role;

-- 16. Seed initial profile singleton & default assumptions
INSERT INTO public.profile (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assumptions (key, scenario, value, unit, rationale, source) VALUES
('equity_return','conservative',8,'pct','Lower end of long-run Indian equity nominal returns','User-configurable planning assumption'),
('equity_return','base',10.5,'pct','Mid of the 8-12% long-run nominal range','User-configurable planning assumption'),
('equity_return','optimistic',12,'pct','Upper end of defensible long-run range','User-configurable planning assumption'),
('debt_return','conservative',5,'pct','Low end of debt/FD returns','User-configurable planning assumption'),
('debt_return','base',6.5,'pct','Mid of 5-7% debt range','User-configurable planning assumption'),
('debt_return','optimistic',7.5,'pct','High end of debt range','User-configurable planning assumption'),
('gold_return','conservative',5,'pct','Low end of long-run gold returns','User-configurable planning assumption'),
('gold_return','base',6.5,'pct','Mid of 5-8% gold range','User-configurable planning assumption'),
('gold_return','optimistic',8,'pct','High end of gold range','User-configurable planning assumption'),
('cash_return','conservative',3,'pct','Savings account rate','User-configurable planning assumption'),
('cash_return','base',3.5,'pct','Savings/sweep rate','User-configurable planning assumption'),
('cash_return','optimistic',4,'pct','Sweep FD rate','User-configurable planning assumption'),
('inflation','conservative',6,'pct','Upper end of the 4-6% band, conservative for planning','User-configurable planning assumption'),
('inflation','base',5.5,'pct','Slightly above RBI mid-point target for household inflation','User-configurable planning assumption'),
('inflation','optimistic',4.5,'pct','Near RBI target','User-configurable planning assumption'),
('sip_step_up','conservative',5,'pct','Modest annual SIP increase','User-configurable planning assumption'),
('sip_step_up','base',10,'pct','Annual SIP increase in line with salary growth','User-configurable planning assumption'),
('sip_step_up','optimistic',12,'pct','Higher annual SIP increase','User-configurable planning assumption')
ON CONFLICT (key, scenario) DO NOTHING;
