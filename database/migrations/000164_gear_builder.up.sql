BEGIN;

-- gear_lists: user-owned gear progression lists with metadata + JSON payload.
CREATE TABLE gear_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  class_id INT NOT NULL,
  spec_name TEXT NOT NULL DEFAULT '',
  -- "public" = anyone can view, "unlisted" = viewable by direct link,
  -- "private" = owner only.
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'unlisted', 'private')),

  -- JSON payload: { "stages": [ { "name": "...", "slots": { "0": itemID, ... } } ] }
  -- 19 equipment slots (0-18).
  payload JSONB NOT NULL DEFAULT '{"stages":[]}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gear_lists_title_length_chk CHECK (char_length(title) BETWEEN 1 AND 128),
  CONSTRAINT gear_lists_description_length_chk CHECK (char_length(description) <= 2000),
  CONSTRAINT gear_lists_payload_size_chk CHECK (octet_length(payload::text) <= 65536)
);

CREATE INDEX gear_lists_user_tenant_idx ON gear_lists (user_id, tenant_id);
CREATE INDEX gear_lists_visibility_idx ON gear_lists (visibility) WHERE visibility IN ('public', 'unlisted');

-- gear_stat_weights: user-defined stat-weight sets (live/mutable).
CREATE TABLE gear_stat_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',

  name TEXT NOT NULL,
  class_id INT NOT NULL DEFAULT 0,
  spec_name TEXT NOT NULL DEFAULT '',

  -- JSON map: { "stamina": 1.0, "intellect": 0.8, ... }
  weights JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gear_stat_weights_name_length_chk CHECK (char_length(name) BETWEEN 1 AND 128),
  CONSTRAINT gear_stat_weights_weights_size_chk CHECK (octet_length(weights::text) <= 8192)
);

CREATE INDEX gear_stat_weights_user_tenant_idx ON gear_stat_weights (user_id, tenant_id);

-- gear_stat_weight_pins: admin-managed references to user stat weights,
-- scoped by tenant + dataset. Pins reference the live stat weight (not a copy).
CREATE TABLE gear_stat_weight_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  stat_weight_id UUID NOT NULL REFERENCES gear_stat_weights(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gear_stat_weight_pins_unique UNIQUE (tenant_id, dataset_id, stat_weight_id)
);

CREATE INDEX gear_stat_weight_pins_tenant_dataset_idx ON gear_stat_weight_pins (tenant_id, dataset_id);

COMMIT;
