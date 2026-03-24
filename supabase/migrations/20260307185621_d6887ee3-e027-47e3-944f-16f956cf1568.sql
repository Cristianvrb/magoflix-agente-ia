CREATE TABLE public.social_keyword_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  reply_text text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_keyword_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to social_keyword_replies" ON public.social_keyword_replies FOR ALL USING (true) WITH CHECK (true);

-- Add hashtags column to social_posts for first comment hashtags
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS hashtags text DEFAULT NULL;