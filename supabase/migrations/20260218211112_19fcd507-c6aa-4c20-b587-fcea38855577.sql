
-- Adicionar colunas de comportamento humano em agent_settings
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS response_delay_min integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS response_delay_max integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS simulate_typing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS business_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_hours_start text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS business_hours_end text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS business_hours_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS outside_hours_message text NOT NULL DEFAULT 'Estamos fora do horario de atendimento no momento. Retornaremos em breve!',
  ADD COLUMN IF NOT EXISTS welcome_message text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_delay_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS followup_message text NOT NULL DEFAULT '';

-- Adicionar controle de IA por conversa
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
