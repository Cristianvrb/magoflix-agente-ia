
-- Tabela conversations
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'web')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  lead_stage TEXT NOT NULL DEFAULT 'novo' CHECK (lead_stage IN ('novo', 'qualificado', 'proposta', 'fechado', 'perdido')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_conversations_lead_stage ON public.conversations(lead_stage);

-- Tabela agent_settings
CREATE TABLE public.agent_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL DEFAULT 'Agente Unificado',
  agent_prompt TEXT NOT NULL DEFAULT 'Você é um assistente de vendas amigável e profissional. Seu objetivo é qualificar leads, apresentar o produto e conduzir o cliente pelo funil de vendas.',
  product_info TEXT NOT NULL DEFAULT 'Nosso SaaS ajuda empresas a automatizar processos de vendas com IA. Planos: Starter R$97/mês, Pro R$197/mês, Premium R$397/mês.',
  faq TEXT NOT NULL DEFAULT 'Pergunta: Tem trial gratuito?
Resposta: Sim, 14 dias grátis com acesso ao plano Pro.

Pergunta: Qual o prazo de contrato?
Resposta: Sem fidelidade, cancele quando quiser.',
  uazapi_subdomain TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir configuração padrão
INSERT INTO public.agent_settings (agent_name) VALUES ('Agente Unificado');

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_settings_updated_at
  BEFORE UPDATE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Desabilitar RLS (projeto pessoal sem autenticação)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para acesso via anon key
CREATE POLICY "Allow all access to conversations" ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to agent_settings" ON public.agent_settings FOR ALL USING (true) WITH CHECK (true);

-- Habilitar realtime para messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
