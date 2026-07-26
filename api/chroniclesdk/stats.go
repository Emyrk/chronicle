package chroniclesdk

// SiteStats aggregates public site-wide statistics for the homepage.
type SiteStats struct {
	LogsParsed     int64 `json:"logs_parsed"`
	PlayersTracked int64 `json:"players_tracked"`
	Guilds         int64 `json:"guilds"`
	BossKills      int64 `json:"boss_kills"`
}
