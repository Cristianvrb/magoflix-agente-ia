
CREATE TABLE public.pepper_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL DEFAULT '',
  payment_status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT '',
  amount integer NOT NULL DEFAULT 0,
  amount_liquid integer NOT NULL DEFAULT 0,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  offer_hash text NOT NULL DEFAULT '',
  product_hash text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  offer_name text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  pepper_created_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pepper_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pepper_transactions"
  ON public.pepper_transactions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE UNIQUE INDEX idx_pepper_transactions_hash ON public.pepper_transactions(hash);
