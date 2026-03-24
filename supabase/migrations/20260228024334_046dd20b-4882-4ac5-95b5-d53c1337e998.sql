-- Add agent_id column to instances table
ALTER TABLE public.instances ADD COLUMN agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;