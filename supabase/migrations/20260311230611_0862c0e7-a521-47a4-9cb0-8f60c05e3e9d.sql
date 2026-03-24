-- Delete duplicate Purchase records for conversation d46eeacd (keep only the first one)
DELETE FROM public.conversions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id, event_name ORDER BY created_at ASC) as rn
    FROM public.conversions
    WHERE conversation_id = 'd46eeacd-d0f7-4e24-91fc-fe44d5cff484'
    AND event_name IN ('Purchase', 'InitiateCheckout')
  ) ranked
  WHERE rn > 1
);