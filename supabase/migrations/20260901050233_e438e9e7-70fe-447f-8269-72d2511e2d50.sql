
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profile (
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
CREATE TRIGGER profile_updated BEFORE UPDATE ON public.profile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.holdings (
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
CREATE TRIGGER holdings_updated BEFORE UPDATE ON public.holdings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.planned_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
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
  is_demo BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.planned_investments TO service_role;
ALTER TABLE public.planned_investments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER planned_updated BEFORE UPDATE ON public.planned_investments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  current_cost NUMERIC NOT NULL DEFAULT 0,
  target_date DATE,
  inflation_pct NUMERIC,
  current_savings NUMERIC NOT NULL DEFAULT 0,
  expected_return_pct NUMERIC,
  priority TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'base',
  value NUMERIC NOT NULL,
  unit TEXT,
  rationale TEXT,
  source TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, scenario)
);
GRANT ALL ON public.assumptions TO service_role;
ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER assumptions_updated BEFORE UPDATE ON public.assumptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.market_data (
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
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.market_data TO service_role;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER market_data_updated BEFORE UPDATE ON public.market_data FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_on DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value NUMERIC NOT NULL DEFAULT 0,
  invested NUMERIC NOT NULL DEFAULT 0,
  unrealised_gain NUMERIC NOT NULL DEFAULT 0,
  allocation JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.snapshots TO service_role;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

INSERT INTO public.profile (id) VALUES ('singleton');

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
('sip_step_up','optimistic',12,'pct','Higher annual SIP increase','User-configurable planning assumption');
