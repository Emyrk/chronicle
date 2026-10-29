BEGIN;

DROP INDEX proof_request_subjects_pending_guild;

ALTER TABLE proof_request_subjects
  DROP CONSTRAINT proof_request_subjects_guild_identity,
  DROP COLUMN guild_id;

COMMIT;
