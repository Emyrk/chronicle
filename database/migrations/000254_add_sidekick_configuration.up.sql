BEGIN;

CREATE TABLE sidekick_account_configs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sidekick_account_configs_config_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE TABLE sidekick_config_overrides (
  sidekick_id UUID PRIMARY KEY REFERENCES sidekick_installations(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sidekick_config_overrides_config_object CHECK (jsonb_typeof(config) = 'object')
);

COMMIT;
