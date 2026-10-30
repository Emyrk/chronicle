CREATE TABLE user_notification_settings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('discord')),
  event TEXT NOT NULL CHECK (event IN ('sidekick_upload_accepted', 'upload_processed')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel, event)
);
