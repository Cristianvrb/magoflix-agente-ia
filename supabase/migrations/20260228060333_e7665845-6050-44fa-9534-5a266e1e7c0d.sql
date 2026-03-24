
CREATE TABLE public.pepper_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  offer_hash TEXT NOT NULL,
  product_hash TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pepper_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pepper_products"
  ON public.pepper_products
  FOR ALL
  USING (true)
  WITH CHECK (true);
