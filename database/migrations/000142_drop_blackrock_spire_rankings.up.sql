-- Remove all Blackrock Spire speedrun and DPS rankings data.
-- BRS uses DerivedName so data may exist under either name.

DELETE FROM instance_speedruns
WHERE instance_name IN ('Blackrock Spire', 'Upper Blackrock Spire');

DELETE FROM encounter_dps_rankings
WHERE instance_name IN ('Blackrock Spire', 'Upper Blackrock Spire');

DELETE FROM rankings_instance_summaries
WHERE instance_name IN ('Blackrock Spire', 'Upper Blackrock Spire');

DELETE FROM leaderboard_version_requirements
WHERE instance_name IN ('Blackrock Spire', 'Upper Blackrock Spire');
