BEGIN;

CREATE TABLE user_whats_new_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seen_id TEXT NOT NULL CHECK (seen_id <> ''),
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
