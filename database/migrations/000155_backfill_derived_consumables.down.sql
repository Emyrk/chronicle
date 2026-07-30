BEGIN;

-- The rows rebuilt by the up migration are derived game data and may have been
-- refreshed by later item or spell imports. Leave the current catalog intact.

COMMIT;
