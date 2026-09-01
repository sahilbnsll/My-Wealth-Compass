CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES public.holdings(id) ON DELETE SET NULL,
  kind text NOT NULL,
  trade_date date NOT NULL DEFAULT CURRENT_DATE,
  settlement_date date,
  name text NOT NULL,
  symbol text,
  isin text,
  asset_class text NOT NULL DEFAULT 'equity',
  instrument_type text NOT NULL DEFAULT 'other',
  quantity numeric,
  price numeric,
  amount numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.transactions TO service_role;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to transactions"
  ON public.transactions FOR ALL USING (false) WITH CHECK (false);

CREATE UNIQUE INDEX transactions_external_id_key ON public.transactions (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX transactions_trade_date_idx ON public.transactions (trade_date DESC);
CREATE INDEX transactions_holding_idx ON public.transactions (holding_id);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();