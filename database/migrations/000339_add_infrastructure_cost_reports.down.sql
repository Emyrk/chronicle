BEGIN;
DROP TRIGGER IF EXISTS infrastructure_cost_report_users_immutable ON infrastructure_cost_report_users;
DROP TRIGGER IF EXISTS infrastructure_cost_reports_immutable ON infrastructure_cost_reports;
DROP FUNCTION IF EXISTS reject_infrastructure_cost_report_mutation();
DROP TABLE IF EXISTS infrastructure_cost_report_users;
DROP TABLE IF EXISTS infrastructure_cost_reports;
COMMIT;
