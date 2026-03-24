CREATE TABLE public.threads_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL UNIQUE,
  author_username text NOT NULL DEFAULT '',
  author_id text,
  content text NOT NULL DEFAULT '',
  keyword_matched text NOT NULL DEFAULT '',
  reply_content text,
  replied_at timestamptz,
  status text NOT NULL DEFAULT 'found',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.threads_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to threads_prospects"
  ON public.threads_prospects FOR ALL
  USING (true) WITH CHECK (true);