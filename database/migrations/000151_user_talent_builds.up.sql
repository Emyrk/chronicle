CREATE TABLE user_talent_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Tenant the build was saved on. The zero UUID means the root domain
  -- (no tenant). Builds are only visible on the tenant they were saved on.
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',

  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  class_id INT NOT NULL,
  -- Positional WoWHead-style build string, e.g. "35003-05032-00000".
  build TEXT NOT NULL DEFAULT '',
  -- Whether the build is locked in the calculator (prevents edits).
  locked BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_talent_builds_name_length_chk CHECK (char_length(name) BETWEEN 1 AND 64),
  CONSTRAINT user_talent_builds_build_length_chk CHECK (char_length(build) <= 512)
);

-- Case-insensitive unique build names per user per tenant.
CREATE UNIQUE INDEX user_talent_builds_user_name_ci_uidx ON user_talent_builds (user_id, tenant_id, name_normalized);
CREATE INDEX user_talent_builds_user_tenant_idx ON user_talent_builds (user_id, tenant_id);
