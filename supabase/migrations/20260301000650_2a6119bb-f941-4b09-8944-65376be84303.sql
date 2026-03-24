ALTER TABLE public.agent_settings
  ADD COLUMN pix_evp_key_fallback text NOT NULL DEFAULT '',
  ADD COLUMN card_payment_url_fallback text NOT NULL DEFAULT '',
  ADD COLUMN payment_error_pix_message text NOT NULL DEFAULT '',
  ADD COLUMN payment_error_card_message text NOT NULL DEFAULT '';