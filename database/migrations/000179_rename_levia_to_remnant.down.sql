BEGIN;

-- Intentionally irreversible: historical Remnant rows cannot be distinguished
-- from rows migrated from Levia without storing migration provenance.

COMMIT;
