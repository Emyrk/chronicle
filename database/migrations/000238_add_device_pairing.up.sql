BEGIN;

-- Short-lived pairing requests started by a non-browser client. The user_code
-- is shown to the user; the device_code is the client's polling secret and is
-- stored hashed.
CREATE TABLE device_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code TEXT NOT NULL UNIQUE,
  device_code_hash BYTEA NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT device_pairings_status CHECK (status IN ('pending', 'approved', 'denied', 'redeemed')),
  CONSTRAINT device_pairings_device_code_hash_length CHECK (octet_length(device_code_hash) = 32)
);

CREATE INDEX device_pairings_expires_at_idx ON device_pairings(expires_at);

-- Long-lived, upload-scoped per-device credentials. Only the SHA-256 of the
-- token is stored.
CREATE TABLE upload_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX upload_devices_user_id_idx ON upload_devices(user_id);

COMMIT;
