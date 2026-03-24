CREATE TABLE campaign_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  campaign_name text NOT NULL DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  spend numeric NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  cpm numeric NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  leads_meta integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, date)
);
ALTER TABLE campaign_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to campaign_snapshots" ON campaign_snapshots FOR ALL USING (true) WITH CHECK (true);