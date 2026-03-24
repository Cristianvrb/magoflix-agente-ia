
CREATE TABLE public.manager_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_type text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed boolean NOT NULL DEFAULT false,
  result text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to manager_decisions"
  ON public.manager_decisions
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_manager_decisions_created ON public.manager_decisions(created_at DESC);
