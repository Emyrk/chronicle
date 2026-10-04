-- Notices must target one deployment. Global notice creation is not supported.
CREATE TRIGGER notices_require_deployment_insert
BEFORE INSERT ON notices
WHEN NEW.deployment_id IS NULL OR NEW.deployment_id = ''
BEGIN
    SELECT RAISE(ABORT, 'deployment_id is required');
END;

CREATE TRIGGER notices_require_deployment_update
BEFORE UPDATE OF deployment_id ON notices
WHEN NEW.deployment_id IS NULL OR NEW.deployment_id = ''
BEGIN
    SELECT RAISE(ABORT, 'deployment_id is required');
END;
