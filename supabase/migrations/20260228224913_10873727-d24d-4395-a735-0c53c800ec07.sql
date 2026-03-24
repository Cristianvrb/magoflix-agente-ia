CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_group_id text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  respond_mode text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to groups" ON public.groups
  FOR ALL USING (true) WITH CHECK (true);