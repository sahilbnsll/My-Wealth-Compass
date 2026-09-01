ALTER TABLE public.assumptions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE public.watchlist (
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
CREATE POLICY "No direct client access to watchlist" ON public.watchlist FOR ALL USING (false) WITH CHECK (false);
CREATE TRIGGER watchlist_updated BEFORE UPDATE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.calendar_events (
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
CREATE POLICY "No direct client access to calendar events" ON public.calendar_events FOR ALL USING (false) WITH CHECK (false);
CREATE TRIGGER calendar_events_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reviews (
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
CREATE POLICY "No direct client access to reviews" ON public.reviews FOR ALL USING (false) WITH CHECK (false);
CREATE TRIGGER reviews_updated BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();