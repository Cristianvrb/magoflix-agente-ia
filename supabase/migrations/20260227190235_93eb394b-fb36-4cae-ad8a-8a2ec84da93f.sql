
-- Create instances table
CREATE TABLE public.instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  uazapi_subdomain text NOT NULL DEFAULT '',
  uazapi_token text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to instances" ON public.instances FOR ALL USING (true) WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_instances_updated_at
BEFORE UPDATE ON public.instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add instance_id to conversations
ALTER TABLE public.conversations ADD COLUMN instance_id uuid REFERENCES public.instances(id);

-- Migrate existing instance from agent_settings if configured
INSERT INTO public.instances (name, uazapi_subdomain, uazapi_token)
SELECT 'Instância Principal', uazapi_subdomain, uazapi_token
FROM public.agent_settings
WHERE uazapi_subdomain IS NOT NULL AND uazapi_subdomain != ''
LIMIT 1;
