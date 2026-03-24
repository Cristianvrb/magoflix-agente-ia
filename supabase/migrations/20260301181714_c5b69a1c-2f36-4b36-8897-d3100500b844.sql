CREATE TABLE meta_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meta_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to meta_settings" ON meta_settings FOR ALL USING (true) WITH CHECK (true);