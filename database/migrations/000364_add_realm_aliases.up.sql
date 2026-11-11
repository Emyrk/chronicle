BEGIN;

ALTER TABLE wow_server_realms
    ADD COLUMN aliases text[] NOT NULL DEFAULT '{}';

CREATE FUNCTION validate_wow_server_realm_names_unique()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Realm writes are rare. Serialize them so cross-row alias checks cannot race.
    PERFORM pg_advisory_xact_lock(hashtext('wow_server_realm_names_unique'));

    IF EXISTS (
        SELECT 1
        FROM unnest(NEW.aliases) AS alias(name)
        WHERE btrim(alias.name) = ''
           OR lower(btrim(alias.name)) = lower(btrim(NEW.name))
    ) THEN
        RAISE EXCEPTION 'realm aliases must be non-empty and distinct from the primary name'
            USING ERRCODE = 'unique_violation';
    END IF;

    IF (
        SELECT count(*)
        FROM unnest(NEW.aliases) AS alias(name)
    ) <> (
        SELECT count(DISTINCT lower(btrim(alias.name)))
        FROM unnest(NEW.aliases) AS alias(name)
    ) THEN
        RAISE EXCEPTION 'realm aliases must be unique'
            USING ERRCODE = 'unique_violation';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM wow_server_realms AS existing_realm
        CROSS JOIN LATERAL unnest(ARRAY[existing_realm.name] || existing_realm.aliases) AS existing_name(name)
        CROSS JOIN LATERAL unnest(ARRAY[NEW.name] || NEW.aliases) AS candidate_name(name)
        WHERE existing_realm.id <> NEW.id
          AND lower(btrim(existing_name.name)) = lower(btrim(candidate_name.name))
    ) THEN
        RAISE EXCEPTION 'realm name or alias already exists'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER wow_server_realms_names_unique
BEFORE INSERT OR UPDATE OF name, aliases ON wow_server_realms
FOR EACH ROW
EXECUTE FUNCTION validate_wow_server_realm_names_unique();

UPDATE wow_server_realms
SET aliases = array_append(aliases, '普通-US')
WHERE lower(name) = 'normal-us';

COMMIT;
