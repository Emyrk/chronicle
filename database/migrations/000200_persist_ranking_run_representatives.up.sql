BEGIN;

ALTER TABLE log_instances
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE ranking_runs (
    run_id UUID PRIMARY KEY,
    representative_instance_id UUID NOT NULL
        REFERENCES log_instances(id) ON DELETE CASCADE,
    realm_id UUID NOT NULL
        REFERENCES wow_server_realms(id),
    instance_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players INTEGER NOT NULL,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    boss_coverage INTEGER NOT NULL,
    member_count INTEGER NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ranking_runs_representative_instance_idx
    ON ranking_runs (representative_instance_id);

CREATE INDEX ranking_runs_instance_filter_idx
    ON ranking_runs (instance_name, difficulty_name, max_players, realm_id);

CREATE INDEX ranking_runs_realm_end_time_idx
    ON ranking_runs (realm_id, end_time DESC);

COMMIT;
