ALTER TABLE public.planned_investments ADD COLUMN IF NOT EXISTS symbol TEXT;
ALTER TABLE public.planned_investments ADD COLUMN IF NOT EXISTS isin TEXT;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS equity_allocation_pct NUMERIC;