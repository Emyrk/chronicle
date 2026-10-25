BEGIN;

-- Preserve existing visibility and callouts as the zug-zug method. Tenants
-- without an external linking setting remain opted out of both methods.
UPDATE tenants
SET external_linking = (external_linking - 'show' - 'callout') ||
  jsonb_build_object('methods', jsonb_build_object(
    'zug-zug', jsonb_build_object(
      'enabled', COALESCE((external_linking->>'show')::boolean, false),
      'callout', COALESCE(external_linking->>'callout', '')
    )
  ))
WHERE external_linking IS NOT NULL AND external_linking ? 'show';

COMMIT;
