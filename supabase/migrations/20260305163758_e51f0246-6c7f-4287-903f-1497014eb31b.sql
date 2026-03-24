CREATE TABLE public.group_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  image_url text,
  audio_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to group_templates"
  ON public.group_templates FOR ALL
  USING (true) WITH CHECK (true);