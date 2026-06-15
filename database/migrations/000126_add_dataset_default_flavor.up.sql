BEGIN;

ALTER TABLE datasets ADD COLUMN default_flavor TEXT[] NOT NULL DEFAULT '{}';

END;
