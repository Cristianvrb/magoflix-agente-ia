
-- Adicionar contadores na tabela groups
ALTER TABLE public.groups
  ADD COLUMN members_joined integer NOT NULL DEFAULT 0,
  ADD COLUMN members_left integer NOT NULL DEFAULT 0;

-- Tabela de mensagens de propaganda
CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_url text,
  schedule_enabled boolean NOT NULL DEFAULT false,
  schedule_interval_hours integer NOT NULL DEFAULT 24,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to group_messages" ON public.group_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Tabela de eventos de membros
CREATE TABLE public.group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'join',
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.group_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to group_events" ON public.group_events
  FOR ALL USING (true) WITH CHECK (true);
