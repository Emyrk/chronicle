BEGIN;

CREATE TABLE user_custom_panel_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    installations JSONB NOT NULL DEFAULT '[]'::jsonb,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_custom_panel_settings_installations_array
        CHECK (jsonb_typeof(installations) = 'array'),
    CONSTRAINT user_custom_panel_settings_installations_size
        CHECK (octet_length(installations::text) <= 1048576)
);

COMMIT;
