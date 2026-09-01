CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to app settings"
  ON public.app_settings FOR ALL
  USING (false) WITH CHECK (false);

CREATE TRIGGER app_settings_updated
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();