ALTER TABLE agent_settings
  ADD COLUMN pix_evp_key text NOT NULL DEFAULT '',
  ADD COLUMN card_payment_url text NOT NULL DEFAULT '';