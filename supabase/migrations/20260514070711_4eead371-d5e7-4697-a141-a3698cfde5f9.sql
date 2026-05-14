CREATE TABLE public.weeks (
  week INTEGER PRIMARY KEY,
  period TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.monthly (
  month INTEGER PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly ENABLE ROW LEVEL SECURITY;

-- Public read access (dashboard is public)
CREATE POLICY "Anyone can read weeks"
  ON public.weeks FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read monthly"
  ON public.monthly FOR SELECT
  USING (true);

-- No client-side write policies. All writes go through server functions
-- using the service role key after password verification.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER weeks_touch_updated_at
  BEFORE UPDATE ON public.weeks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER monthly_touch_updated_at
  BEFORE UPDATE ON public.monthly
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();