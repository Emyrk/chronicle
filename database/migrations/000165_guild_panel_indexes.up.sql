BEGIN;

-- Guild page "Top Parses" panel: look up a guild's parses by metric and kill time.
CREATE INDEX idx_psr_guild
ON parse_score_results (tenant_id, guild_id, metric, killed_at DESC NULLS LAST)
WHERE guild_id IS NOT NULL;

-- Guild page "Roster" panel: list a guild's characters.
CREATE INDEX idx_game_players_guild
ON game_players (guild_id)
WHERE guild_id IS NOT NULL;

COMMIT;
