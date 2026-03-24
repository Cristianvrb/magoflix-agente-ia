-- Add a 'usage_type' column to distinguish between chat, audio transcription, image, etc.
ALTER TABLE public.token_usage ADD COLUMN IF NOT EXISTS usage_type text NOT NULL DEFAULT 'chat';
-- Possible values: 'chat', 'audio', 'memory', 'summary'