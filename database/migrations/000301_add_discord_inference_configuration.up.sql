BEGIN;

CREATE TABLE inference_discord_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  connection_id UUID REFERENCES inference_connections(id) ON DELETE SET NULL,
  default_model TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO inference_discord_config (id) VALUES (TRUE);

COMMIT;
