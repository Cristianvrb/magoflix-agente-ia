
-- social_posts table
CREATE TABLE public.social_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  platform TEXT NOT NULL DEFAULT 'both',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  ig_post_id TEXT,
  threads_post_id TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to social_posts" ON public.social_posts FOR ALL USING (true) WITH CHECK (true);

-- social_settings table (key/value like meta_settings)
CREATE TABLE public.social_settings (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.social_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to social_settings" ON public.social_settings FOR ALL USING (true) WITH CHECK (true);
