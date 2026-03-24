
ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS ab_weight integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS stats_sent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stats_qualified integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stats_converted integer NOT NULL DEFAULT 0;
