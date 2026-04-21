CREATE TABLE site_config (
    -- singleton row enforced by CHECK constraint
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    signups_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO site_config (signups_enabled) VALUES (TRUE);
