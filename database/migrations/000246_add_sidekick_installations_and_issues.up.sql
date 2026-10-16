BEGIN;

ALTER TABLE oauth_device_sessions
  ADD COLUMN sidekick_installation_id UUID,
  ADD COLUMN sidekick_installation_name TEXT CHECK (sidekick_installation_name IS NULL OR char_length(sidekick_installation_name) BETWEEN 1 AND 100),
  ADD COLUMN sidekick_installation_platform TEXT CHECK (sidekick_installation_platform IS NULL OR char_length(sidekick_installation_platform) <= 100),
  ADD COLUMN sidekick_installation_version TEXT CHECK (sidekick_installation_version IS NULL OR char_length(sidekick_installation_version) <= 100);

CREATE TABLE sidekick_installations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  platform TEXT NOT NULL DEFAULT '' CHECK (char_length(platform) <= 100),
  version TEXT NOT NULL DEFAULT '' CHECK (char_length(version) <= 100),
  last_seen_at TIMESTAMPTZ,
  last_upload_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sidekick_installations_user_id_idx
  ON sidekick_installations (user_id, created_at DESC);

CREATE TABLE sidekick_oauth_grants (
  oauth_request_id TEXT PRIMARY KEY,
  sidekick_id UUID NOT NULL REFERENCES sidekick_installations(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sidekick_oauth_grants_sidekick_id_idx
  ON sidekick_oauth_grants (sidekick_id)
  WHERE revoked_at IS NULL;

CREATE TABLE sidekick_wow_directories (
  sidekick_id UUID NOT NULL REFERENCES sidekick_installations(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK (char_length(path) BETWEEN 1 AND 2000),
  tenant_name TEXT NOT NULL CHECK (char_length(tenant_name) BETWEEN 1 AND 100),
  tenant_base_url TEXT NOT NULL CHECK (char_length(tenant_base_url) BETWEEN 1 AND 500),
  realmlist TEXT NOT NULL DEFAULT '' CHECK (char_length(realmlist) <= 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sidekick_id, path)
);

CREATE TABLE sidekick_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sidekick_id UUID NOT NULL REFERENCES sidekick_installations(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (char_length(code) BETWEEN 1 AND 100),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  details TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 4000),
  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX sidekick_issues_active_code_idx
  ON sidekick_issues (sidekick_id, code)
  WHERE resolved_at IS NULL;

CREATE INDEX sidekick_issues_history_idx
  ON sidekick_issues (sidekick_id, last_reported_at DESC);

COMMIT;
