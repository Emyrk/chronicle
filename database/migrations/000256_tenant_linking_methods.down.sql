BEGIN;

UPDATE tenants
SET external_linking = (external_linking - 'methods') ||
  jsonb_build_object(
    'show', COALESCE((external_linking->'methods'->'zug-zug'->>'enabled')::boolean, false),
    'callout', COALESCE(external_linking->'methods'->'zug-zug'->>'callout', '')
  )
WHERE external_linking ? 'methods';

COMMIT;
