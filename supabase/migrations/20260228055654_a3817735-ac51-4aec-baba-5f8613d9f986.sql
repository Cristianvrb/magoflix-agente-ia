CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  source text DEFAULT '',
  track_id text DEFAULT '',
  track_source text DEFAULT '',
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to ad_creatives" ON public.ad_creatives FOR ALL USING (true) WITH CHECK (true);