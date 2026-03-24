CREATE TABLE public.changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'strategy',
  created_by text NOT NULL DEFAULT 'system'
);
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to changelog" ON public.changelog FOR ALL TO public USING (true) WITH CHECK (true);