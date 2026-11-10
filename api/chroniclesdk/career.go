package chroniclesdk

import "time"

// CareerPlayerResponse keeps each exact specialization independent, including Renown.
// Collections are serialized as arrays, never null. Status is descriptive, not a score.
type CareerPlayerResponse struct {
	Status          string               `json:"status"`
	Cohorts         []CareerPlayerCohort `json:"cohorts"`
	PoolFingerprint string               `json:"pool_fingerprint"`
	Issues          []CareerIssue        `json:"issues"`
}

type CareerPlayerCohort struct {
	PlayerClass   string        `json:"player_class"`
	PlayerSpec    string        `json:"player_spec"`
	PlayerSubSpec string        `json:"player_sub_spec"`
	Summary       CareerSummary `json:"summary"`
}

type CareerGuildResponse struct {
	Status          string        `json:"status"`
	Summary         CareerSummary `json:"summary"`
	PoolFingerprint string        `json:"pool_fingerprint"`
	Issues          []CareerIssue `json:"issues"`
}

// CareerSummary contains published components, never an opaque combined score.
// Null performance scores are unavailable, not zero. ChosenMetric is a stored
// player DPS/HPS choice (null before selection); guild kill-time scoring uses null.
type CareerSummary struct {
	Mastery           *float64             `json:"mastery"`
	Peak              *float64             `json:"peak"`
	Renown            float64              `json:"renown"`
	ChosenMetric      *string              `json:"chosen_metric"`
	PerformanceStatus string               `json:"performance_status"`
	ComputedAt        *time.Time           `json:"computed_at"`
	RefreshPending    bool                 `json:"refresh_pending"`
	Contributions     []CareerContribution `json:"contributions"`
}

// CareerContribution identifies an exact configured raid variant. Backend values
// already encode missing-subject zero contributions; clients must not recompute them.
type CareerContribution struct {
	InstanceName        string   `json:"instance_name"`
	DifficultyName      string   `json:"difficulty_name"`
	MaxPlayers          int16    `json:"max_players"`
	Weight              *float64 `json:"weight"`
	IncludeAverage      bool     `json:"include_average"`
	IncludeRenown       bool     `json:"include_renown"`
	Mastery             *float64 `json:"mastery"`
	Peak                *float64 `json:"peak"`
	Renown              float64  `json:"renown"`
	EligibleMetricKills int64    `json:"eligible_metric_kills"`
	EligibleRenownKills int64    `json:"eligible_renown_kills"`
}

type CareerIssue struct {
	InstanceName   string `json:"instance_name"`
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int16  `json:"max_players"`
	Code           string `json:"code"`
}

// CareerLeaderboardResponse ranks characters or guilds by career Mastery, Peak,
// and Renown. A character's Mastery and Peak come from its spec with the
// highest Mastery (or the filtered spec); Renown adds up every spec. Guilds use
// kill-time Mastery and Peak. Status explains unavailable Mastery and Peak.
type CareerLeaderboardResponse struct {
	Status  string                 `json:"status"`
	Mastery CareerLeaderboardBoard `json:"mastery"`
	Peak    CareerLeaderboardBoard `json:"peak"`
	Renown  CareerLeaderboardBoard `json:"renown"`
	// RaidOptions are every raid the board can be narrowed to with `raid`,
	// whatever is selected, heaviest first.
	RaidOptions []CareerLeaderboardRaidOption `json:"raid_options"`
}

// CareerLeaderboardRaidOption is one selectable raid. Key is the `raid` query value.
type CareerLeaderboardRaidOption struct {
	Key            string `json:"key"`
	InstanceName   string `json:"instance_name"`
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int    `json:"max_players"`
	// Weight is null for raids that only count toward Renown.
	Weight         *float64 `json:"weight"`
	IncludeAverage bool     `json:"include_average"`
	IncludeRenown  bool     `json:"include_renown"`
}

// CareerLeaderboardBoard is the top of one ranking; Total counts every ranked subject.
type CareerLeaderboardBoard struct {
	Total   int                      `json:"total"`
	Entries []CareerLeaderboardEntry `json:"entries"`
}

// CareerLeaderboardEntry is a character (subject_id is its GUID) or a guild
// (subject_id is the guild ID). Class, spec, and guild_name are characters only;
// logo_url is guilds only.
type CareerLeaderboardEntry struct {
	SubjectID     string   `json:"subject_id"`
	Name          string   `json:"name"`
	RealmID       string   `json:"realm_id"`
	RealmName     string   `json:"realm_name"`
	PlayerClass   string   `json:"player_class"`
	PlayerSpec    string   `json:"player_spec"`
	PlayerSubSpec string   `json:"player_sub_spec"`
	GuildName     string   `json:"guild_name"`
	LogoURL       string   `json:"logo_url"`
	ChosenMetric  *string  `json:"chosen_metric"`
	Mastery       *float64 `json:"mastery"`
	Peak          *float64 `json:"peak"`
	Renown        float64  `json:"renown"`
	// Form and Floor are null until the subject's inputs are refreshed with them.
	Form  *float64                `json:"form"`
	Floor *float64                `json:"floor"`
	Raids []CareerLeaderboardRaid `json:"raids"`
}

// CareerLeaderboardRaid is one weighted raid behind an entry's Mastery and Peak;
// raids without kills are included at zero.
type CareerLeaderboardRaid struct {
	InstanceName   string  `json:"instance_name"`
	DifficultyName string  `json:"difficulty_name"`
	MaxPlayers     int     `json:"max_players"`
	Weight         float64 `json:"weight"`
	Mastery        float64 `json:"mastery"`
	Peak           float64 `json:"peak"`
	Kills          int64   `json:"kills"`
	// Form and Floor are null, and Bosses empty, until the inputs carry them.
	Form   *float64                    `json:"form"`
	Floor  *float64                    `json:"floor"`
	Bosses []CareerLeaderboardRaidBoss `json:"bosses"`
}

// CareerLeaderboardRaidBoss is one average-eligible boss and its eligible kills (0 if none).
type CareerLeaderboardRaidBoss struct {
	EncounterName string `json:"encounter_name"`
	Count         int64  `json:"count"`
}
