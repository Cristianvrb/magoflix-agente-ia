-- Create customer_feedbacks table
CREATE TABLE public.customer_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  description text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.customer_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feedbacks" ON public.customer_feedbacks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for feedback images
INSERT INTO storage.buckets (id, name, public) VALUES ('feedbacks', 'feedbacks', true);

-- Allow authenticated users to upload to feedbacks bucket
CREATE POLICY "Auth users upload feedbacks" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'feedbacks');

CREATE POLICY "Public read feedbacks" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'feedbacks');

CREATE POLICY "Auth users delete feedbacks" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'feedbacks');