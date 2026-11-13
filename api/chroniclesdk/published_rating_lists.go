package chroniclesdk

type PublishedGuildFullListResponse struct {
	Rows        []PublishedGuildFullListRow `json:"rows"`
	Total       int64                       `json:"total"`
	Page        int64                       `json:"page"`
	HasNextPage bool                        `json:"has_next_page"`
}

type PublishedGuildFullListRow struct {
	Rank   int64                           `json:"rank"`
	Entry  TenantGuildBossLeaderboardEntry `json:"entry"`
	Scores PublishedPlayerFullListScores   `json:"scores"`
}

type PublishedPlayerFullListResponse struct {
	Rows        []PublishedPlayerFullListRow `json:"rows"`
	Total       int64                        `json:"total"`
	Page        int64                        `json:"page"`
	HasNextPage bool                         `json:"has_next_page"`
}

type PublishedPlayerFullListRow struct {
	Rank   int64                            `json:"rank"`
	Entry  TenantPlayerBossLeaderboardEntry `json:"entry"`
	Scores PublishedPlayerFullListScores    `json:"scores"`
}

type PublishedPlayerFullListScores struct {
	Peak    *float64 `json:"peak"`
	Mastery *float64 `json:"mastery"`
	Renown  *float64 `json:"renown"`
}
