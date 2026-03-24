
-- =============================================
-- Fase 1: Tabelas do sistema de agentes de IA
-- =============================================

-- 1.1 Tabela agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  welcome_message TEXT,
  away_message TEXT,
  temperature NUMERIC DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  context_limit INTEGER DEFAULT 20,
  response_delay_seconds INTEGER DEFAULT 0,
  message_buffer_seconds INTEGER DEFAULT 0,
  business_hours_start TEXT,
  business_hours_end TEXT,
  inactivity_timeout_minutes INTEGER DEFAULT 60,
  ai_model TEXT,
  language TEXT DEFAULT 'pt-BR',
  max_chars_per_message INTEGER DEFAULT 0,
  display_name TEXT,
  end_with_question BOOLEAN DEFAULT false,
  rate_limit_per_minute INTEGER DEFAULT 5,
  restrict_topic BOOLEAN DEFAULT true,
  block_external_search BOOLEAN DEFAULT true,
  humanized_mode BOOLEAN DEFAULT true,
  followup_enabled BOOLEAN DEFAULT false,
  followup_delay_minutes INTEGER DEFAULT 30,
  icon TEXT DEFAULT 'bot',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agents" ON public.agents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agents" ON public.agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agents" ON public.agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents" ON public.agents FOR DELETE USING (auth.uid() = user_id);

-- 1.2 Tabela knowledge_entries
CREATE TABLE public.knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'Geral',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own knowledge" ON public.knowledge_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own knowledge" ON public.knowledge_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own knowledge" ON public.knowledge_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own knowledge" ON public.knowledge_entries FOR DELETE USING (auth.uid() = user_id);

-- 1.3 Tabela agent_knowledge (N:N)
CREATE TABLE public.agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  knowledge_entry_id UUID NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  UNIQUE(agent_id, knowledge_entry_id)
);

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent_knowledge" ON public.agent_knowledge FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_knowledge.agent_id AND agents.user_id = auth.uid()));
CREATE POLICY "Users can create own agent_knowledge" ON public.agent_knowledge FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_knowledge.agent_id AND agents.user_id = auth.uid()));
CREATE POLICY "Users can delete own agent_knowledge" ON public.agent_knowledge FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_knowledge.agent_id AND agents.user_id = auth.uid()));

-- 1.4 Tabela knowledge_documents
CREATE TABLE public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT,
  file_url TEXT,
  file_size INTEGER,
  extracted_text TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON public.knowledge_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own documents" ON public.knowledge_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.knowledge_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.knowledge_documents FOR DELETE USING (auth.uid() = user_id);

-- 1.5 Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-documents', 'knowledge-documents', false);

CREATE POLICY "Users can upload own docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own docs" ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
