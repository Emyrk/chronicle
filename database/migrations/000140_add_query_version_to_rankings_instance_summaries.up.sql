ALTER TABLE rankings_instance_summaries
    ADD COLUMN query_version smallint NOT NULL DEFAULT 0;
