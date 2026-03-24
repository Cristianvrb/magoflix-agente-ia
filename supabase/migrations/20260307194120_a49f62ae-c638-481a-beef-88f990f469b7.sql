
CREATE TABLE public.threads_trending_monitor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id text NOT NULL,
  author_username text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  keyword_matched text NOT NULL DEFAULT '',
  snapshot_time timestamptz NOT NULL DEFAULT now(),
  like_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  repost_count integer NOT NULL DEFAULT 0,
  velocity numeric NOT NULL DEFAULT 0,
  viral_score numeric NOT NULL DEFAULT 0,
  is_trending boolean NOT NULL DEFAULT false,
  auto_replied boolean NOT NULL DEFAULT false,
  reply_content text,
  post_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.threads_trending_monitor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to threads_trending_monitor" ON public.threads_trending_monitor FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_trending_thread_id ON public.threads_trending_monitor(thread_id);
CREATE INDEX idx_trending_snapshot_time ON public.threads_trending_monitor(snapshot_time);
CREATE INDEX idx_trending_is_trending ON public.threads_trending_monitor(is_trending);
