
-- Add new columns to manager_decisions for task-based approval workflow
ALTER TABLE public.manager_decisions 
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN reasoning text NOT NULL DEFAULT '',
  ADD COLUMN action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN rejected_reason text NOT NULL DEFAULT '';

-- Migrate existing data: executed=true -> status='executed', executed=false -> status='failed'
UPDATE public.manager_decisions SET status = CASE WHEN executed THEN 'executed' ELSE 'failed' END;

-- Drop old executed column
ALTER TABLE public.manager_decisions DROP COLUMN executed;
