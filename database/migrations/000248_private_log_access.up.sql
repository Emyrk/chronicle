BEGIN;

ALTER TABLE wow_log_groups
ADD COLUMN private BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE private_log_share_links (
  id UUID PRIMARY KEY,
  log_group_id UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX private_log_share_links_log_group_id_idx
ON private_log_share_links(log_group_id);

CREATE TABLE private_log_access_requests (
  id UUID PRIMARY KEY,
  log_group_id UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  share_link_id UUID NOT NULL REFERENCES private_log_share_links(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  UNIQUE (log_group_id, requester_id)
);

CREATE INDEX private_log_access_requests_owner_listing_idx
ON private_log_access_requests(log_group_id, status, created_at);

COMMIT;
