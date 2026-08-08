BEGIN;

-- gear_progressions: a player-picked pool of items rendered as two
-- scrubbers — a continuous leveling axis (best-per-slot derived from the
-- pool at each level) and a discrete max-level axis (explicit stage
-- snapshots). Sibling of gear_lists rather than a `kind` discriminator so
-- the shipped gear-list feature is untouched.
CREATE TABLE gear_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  class_id INT NOT NULL,
  spec_name TEXT NOT NULL DEFAULT '',

  -- JSON payload, version 1:
  -- { "version": 1,
  --   "pool": [ { "item_id": 123, "enchant_id": 456, "note": "..." } ],
  --   "stages": [ { "name": "...", "slots": { "0": { "item_id": 123 } } } ] }
  -- `pool` feeds the leveling scrubber (best-per-slot is derived, never
  -- stored); `stages` reuses the gear_lists stage shape for max level.
  -- Slot keys are the 19 PlayerOutfit indexes (0-18).
  payload JSONB NOT NULL DEFAULT '{"version":1,"pool":[],"stages":[]}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gear_progressions_title_length_chk CHECK (char_length(title) BETWEEN 1 AND 128),
  CONSTRAINT gear_progressions_description_length_chk CHECK (char_length(description) <= 2000),
  CONSTRAINT gear_progressions_payload_size_chk CHECK (octet_length(payload::text) <= 262144)
);

CREATE INDEX gear_progressions_user_tenant_idx ON gear_progressions (user_id, tenant_id);

COMMIT;
