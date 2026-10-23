BEGIN;

CREATE TABLE inference_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  auth_mode TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_credential BYTEA NOT NULL,
  credential_key_version TEXT NOT NULL,
  provider_account_key_hash BYTEA,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX inference_connections_user_idx ON inference_connections(user_id, created_at DESC);
CREATE UNIQUE INDEX inference_connections_active_openrouter_key_idx
  ON inference_connections(user_id, provider_account_key_hash)
  WHERE provider = 'openrouter' AND status = 'active' AND provider_account_key_hash IS NOT NULL;

CREATE TABLE inference_oauth_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  state_hash BYTEA NOT NULL UNIQUE,
  encrypted_verifier BYTEA NOT NULL,
  verifier_key_version TEXT NOT NULL,
  return_path TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inference_oauth_transactions_user_idx ON inference_oauth_transactions(user_id, created_at DESC);
CREATE INDEX inference_oauth_transactions_expires_idx ON inference_oauth_transactions(expires_at);

CREATE TABLE inference_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assistant_id TEXT NOT NULL,
  persistence TEXT NOT NULL,
  context_type TEXT,
  context_id TEXT,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((context_type IS NULL) = (context_id IS NULL))
);

CREATE INDEX inference_threads_user_updated_idx ON inference_threads(user_id, updated_at DESC);
CREATE UNIQUE INDEX inference_threads_durable_context_assistant_idx
  ON inference_threads(user_id, assistant_id, context_type, context_id)
  WHERE persistence = 'durable' AND context_type IS NOT NULL;

CREATE TABLE inference_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES inference_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  tool_call_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inference_messages_thread_created_idx ON inference_messages(thread_id, created_at, id);

CREATE TABLE inference_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES inference_threads(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES inference_connections(id),
  assistant_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX inference_runs_user_created_idx ON inference_runs(user_id, created_at DESC);
CREATE INDEX inference_runs_thread_idx ON inference_runs(thread_id, created_at);

COMMIT;
