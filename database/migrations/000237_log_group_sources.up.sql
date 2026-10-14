CREATE TABLE log_group_sources (
  log_group_id UUID PRIMARY KEY REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  owner UUID NOT NULL REFERENCES users(id),
  source_id TEXT NOT NULL
);

CREATE UNIQUE INDEX log_group_sources_owner_source_id
  ON log_group_sources (owner, source_id);
