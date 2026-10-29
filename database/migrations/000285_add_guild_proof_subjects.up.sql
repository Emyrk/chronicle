BEGIN;

ALTER TABLE proof_request_subjects
  ADD COLUMN guild_id uuid REFERENCES guilds(id),
  ADD CONSTRAINT proof_request_subjects_guild_identity
    CHECK (subject_type <> 'guild' OR guild_id IS NOT NULL);

CREATE UNIQUE INDEX proof_request_subjects_pending_guild
  ON proof_request_subjects (guild_id)
  WHERE subject_type = 'guild' AND status = 'pending';

COMMIT;
