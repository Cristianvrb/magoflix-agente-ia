
-- Tabela de fluxos do chatbot
CREATE TABLE public.chatbot_flows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Novo Fluxo',
  is_active boolean NOT NULL DEFAULT false,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flows"
ON public.chatbot_flows FOR SELECT
USING (EXISTS (SELECT 1 FROM agents WHERE agents.id = chatbot_flows.agent_id AND agents.user_id = auth.uid()));

CREATE POLICY "Users can create own flows"
ON public.chatbot_flows FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM agents WHERE agents.id = chatbot_flows.agent_id AND agents.user_id = auth.uid()));

CREATE POLICY "Users can update own flows"
ON public.chatbot_flows FOR UPDATE
USING (EXISTS (SELECT 1 FROM agents WHERE agents.id = chatbot_flows.agent_id AND agents.user_id = auth.uid()));

CREATE POLICY "Users can delete own flows"
ON public.chatbot_flows FOR DELETE
USING (EXISTS (SELECT 1 FROM agents WHERE agents.id = chatbot_flows.agent_id AND agents.user_id = auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_chatbot_flows_updated_at
BEFORE UPDATE ON public.chatbot_flows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Campo flow_state em conversations para rastrear execução
ALTER TABLE public.conversations ADD COLUMN flow_state jsonb DEFAULT NULL;
