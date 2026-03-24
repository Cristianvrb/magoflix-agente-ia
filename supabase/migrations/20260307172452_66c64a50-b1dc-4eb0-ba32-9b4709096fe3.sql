
CREATE TABLE public.social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text,
  platform text NOT NULL DEFAULT 'instagram',
  author_name text NOT NULL DEFAULT '',
  author_id text,
  content text NOT NULL DEFAULT '',
  reply_content text,
  replied_at timestamp with time zone,
  ai_auto_replied boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to social_comments" ON public.social_comments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.social_dms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'instagram',
  sender_name text NOT NULL DEFAULT '',
  sender_id text,
  content text NOT NULL DEFAULT '',
  reply_content text,
  replied_at timestamp with time zone,
  ai_auto_replied boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_dms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to social_dms" ON public.social_dms FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  platform text NOT NULL DEFAULT 'instagram',
  followers integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  profile_views integer NOT NULL DEFAULT 0,
  posts_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  dms_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to social_metrics" ON public.social_metrics FOR ALL USING (true) WITH CHECK (true);
