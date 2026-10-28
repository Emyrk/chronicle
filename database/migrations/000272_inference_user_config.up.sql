-- Per-user AI assistant configuration. Top-level keys are independent settings, e.g. disabled_assistants
-- (assistant IDs the user turned off); later keys such as saved models live alongside.
CREATE TABLE inference_user_config (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inference_user_config_object CHECK (jsonb_typeof(config) = 'object')
);

-- The Lua workshop is now the panel addon workshop; guide and other addon workshops get their own IDs.
UPDATE inference_threads SET assistant_id = 'addon-workshop-panel' WHERE assistant_id = 'lua-workshop';
UPDATE inference_runs SET assistant_id = 'addon-workshop-panel' WHERE assistant_id = 'lua-workshop';
