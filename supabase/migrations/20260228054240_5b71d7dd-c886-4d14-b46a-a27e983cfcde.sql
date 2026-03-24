
-- Create conversions table to track AI-detected conversions
CREATE TABLE public.conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id),
  event_name TEXT NOT NULL DEFAULT 'Purchase',
  value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  sent_to_meta BOOLEAN NOT NULL DEFAULT false,
  meta_event_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;

-- Allow all access (same pattern as conversations)
CREATE POLICY "Allow all access to conversions"
ON public.conversions
FOR ALL
USING (true)
WITH CHECK (true);
