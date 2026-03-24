
-- Tabela token_usage (contador de tokens)
CREATE TABLE public.token_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to token_usage"
  ON public.token_usage FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_token_usage_conversation ON public.token_usage(conversation_id);
CREATE INDEX idx_token_usage_created ON public.token_usage(created_at);

-- Tabela contact_memories (memória longa)
CREATE TABLE public.contact_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL DEFAULT 'info',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to contact_memories"
  ON public.contact_memories FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_contact_memories_conversation ON public.contact_memories(conversation_id);

-- Tabela conversation_summaries (memória curta - resumos)
CREATE TABLE public.conversation_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to conversation_summaries"
  ON public.conversation_summaries FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_conversation_summaries_conversation ON public.conversation_summaries(conversation_id);
