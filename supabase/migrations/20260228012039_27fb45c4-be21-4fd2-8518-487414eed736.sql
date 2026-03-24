
-- Adicionar colunas de mídia na tabela messages
ALTER TABLE public.messages ADD COLUMN media_url text;
ALTER TABLE public.messages ADD COLUMN media_type text;

-- Criar bucket público para mídias
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true);

-- RLS para storage: leitura pública
CREATE POLICY "Public read chat-media" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

-- RLS para storage: insert (service role via edge functions)
CREATE POLICY "Service insert chat-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
