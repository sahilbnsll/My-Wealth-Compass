ALTER TABLE public.market_data
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS note text;

CREATE OR REPLACE FUNCTION public.capture_portfolio_snapshot()
RETURNS TABLE (taken_on date, total_value numeric, invested numeric)
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
      h.asset_class,
      CASE
        WHEN h.instrument_type IN ('stock','etf','mutual_fund','gold','silver')
          THEN COALESCE(h.quantity,0) * COALESCE(h.current_price,0)
        ELSE COALESCE(h.current_value,0)
      END AS value,
      COALESCE(
        h.cost_basis,
        CASE
          WHEN h.instrument_type IN ('stock','etf','mutual_fund','gold','silver')
            THEN COALESCE(h.quantity,0) * COALESCE(h.avg_price,0)
          ELSE COALESCE(h.current_value,0)
        END
      ) AS invested
    FROM public.holdings h
  )
  SELECT
    COALESCE(SUM(value),0),
    COALESCE(SUM(invested),0),
    COUNT(*)
  INTO v_total, v_invested, v_count
  FROM valued;

  IF v_total > 0 THEN
    WITH valued AS (
      SELECT
        h.asset_class,
        CASE
          WHEN h.instrument_type IN ('stock','etf','mutual_fund','gold','silver')
            THEN COALESCE(h.quantity,0) * COALESCE(h.current_price,0)
          ELSE COALESCE(h.current_value,0)
        END AS value
      FROM public.holdings h
    )
    SELECT COALESCE(jsonb_object_agg(asset_class, ROUND((SUM(value) / v_total) * 100, 4)), '{}'::jsonb)
    INTO v_alloc
    FROM valued
    GROUP BY asset_class;
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

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-portfolio-snapshot';

SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '30 18 * * *',
  $$SELECT public.capture_portfolio_snapshot();$$
);