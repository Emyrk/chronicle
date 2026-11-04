package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// InstanceSearchQuery is the body of POST /api/v1/raidlogs/search.
// See .agents/skills/instance-search/SKILL.md for the query language.
type InstanceSearchQuery struct {
	// Where is the search tree. Omit it to match every visible run.
	Where *InstanceSearchNode `json:"where,omitempty"`
	// Sort changes the result order. Omit it for newest first. Each allowlisted
	// property declares its minimum supporter tier in GET /search/fields.
	Sort *InstanceSearchSort `json:"sort,omitempty"`
	// Limit is the page size. Zero uses the default (25).
	Limit int `json:"limit,omitempty"`
	// Cursor continues from a previous page's Next.
	Cursor *InstanceSearchCursor `json:"cursor,omitempty"`
}

// InstanceSearchSort selects an allowlisted result property and direction.
// ParseScope only applies to instance.clear_parse.
type InstanceSearchSort struct {
	Field      InstanceSearchSortField     `json:"field"`
	Direction  InstanceSearchSortDirection `json:"direction,omitempty"`
	ParseScope InstanceSearchParseScope    `json:"parse_scope,omitempty"`
	// Boss is required when sorting by one boss's kill time.
	Boss string `json:"boss,omitempty"`
}

type InstanceSearchSortField string

const (
	InstanceSearchSortStartedAt    InstanceSearchSortField = "instance.started_at"
	InstanceSearchSortName         InstanceSearchSortField = "instance.name"
	InstanceSearchSortRealm        InstanceSearchSortField = "instance.realm"
	InstanceSearchSortGuild        InstanceSearchSortField = "instance.guild"
	InstanceSearchSortDifficulty   InstanceSearchSortField = "instance.difficulty"
	InstanceSearchSortMaxPlayers   InstanceSearchSortField = "instance.max_players"
	InstanceSearchSortPlayerCount  InstanceSearchSortField = "instance.player_count"
	InstanceSearchSortBossesKilled InstanceSearchSortField = "instance.bosses_killed"
	InstanceSearchSortDeaths       InstanceSearchSortField = "instance.deaths"
	InstanceSearchSortWipes        InstanceSearchSortField = "instance.wipes"
	InstanceSearchSortClearTime    InstanceSearchSortField = "instance.clear_time_ms"
	InstanceSearchSortIdleTime     InstanceSearchSortField = "instance.idle_time_ms"
	InstanceSearchSortBossTime     InstanceSearchSortField = "instance.boss_time_ms"
	InstanceSearchSortKillTime     InstanceSearchSortField = "instance.kill_time_ms"
	InstanceSearchSortClearParse   InstanceSearchSortField = "instance.clear_parse"
)

type InstanceSearchSortDirection string

const (
	InstanceSearchSortAsc  InstanceSearchSortDirection = "asc"
	InstanceSearchSortDesc InstanceSearchSortDirection = "desc"
)

type InstanceSearchSortTier string

const (
	InstanceSearchSortTierFree    InstanceSearchSortTier = "free"
	InstanceSearchSortTierHonored InstanceSearchSortTier = "honored"
	InstanceSearchSortTierRevered InstanceSearchSortTier = "revered"
)

// InstanceSearchSortOption describes one fixed result order for search UIs.
type InstanceSearchSortOption struct {
	Field            InstanceSearchSortField     `json:"field"`
	Label            string                      `json:"label"`
	DefaultDirection InstanceSearchSortDirection `json:"default_direction"`
	ParseScope       bool                        `json:"parse_scope"`
	Boss             bool                        `json:"boss"`
	MinimumTier      InstanceSearchSortTier      `json:"minimum_tier"`
	Cost             int                         `json:"cost"`
}

// InstanceSearchCursor is a keyset pagination position. Value is the selected
// sort property's canonical string value, or null when that value is missing.
type InstanceSearchCursor struct {
	Value *string            `json:"value"`
	ID    uuid.UUID          `json:"id" format:"uuid"`
	Sort  InstanceSearchSort `json:"sort"`
}

// InstanceSearchNode is one node of the search tree. Exactly one of And, Or,
// Not, AnyPlayer, CountPlayers, AnyEncounter, CountEncounters or Field must be
// set.
type InstanceSearchNode struct {
	And []InstanceSearchNode `json:"and,omitempty"`
	Or  []InstanceSearchNode `json:"or,omitempty"`
	Not *InstanceSearchNode  `json:"not,omitempty"`

	// AnyPlayer matches when one player satisfies the subtree. Every
	// predicate in the subtree refers to that same player.
	AnyPlayer *InstanceSearchNode `json:"any_player,omitempty"`
	// CountPlayers compares how many distinct players satisfy the subtree.
	CountPlayers *InstanceSearchCount `json:"count_players,omitempty"`
	// AnyEncounter matches when one encounter (pull) satisfies the subtree.
	AnyEncounter *InstanceSearchNode `json:"any_encounter,omitempty"`
	// CountEncounters compares how many pulls satisfy the subtree.
	CountEncounters *InstanceSearchCount `json:"count_encounters,omitempty"`

	// Field names a predicate, e.g. "player.class".
	Field string           `json:"field,omitempty"`
	Op    InstanceSearchOp `json:"op,omitempty"`
	// Value is a string, number, boolean, a list for in / not_in, or
	// [low, high] for between.
	Value any `json:"value,omitempty"`
	// Bosses restricts boss-based predicates to these encounter names.
	Bosses []string `json:"bosses,omitempty"`
	// Match is "any" (default) or "each" for predicates that take Bosses.
	Match InstanceSearchMatch `json:"match,omitempty"`
	// ParseScope selects the time-parse cohort (default server).
	ParseScope InstanceSearchParseScope `json:"parse_scope,omitempty"`
	// Metric selects the player parse metric (default dps).
	Metric InstanceSearchMetric `json:"metric,omitempty"`
	// On selects which fights per-fight player data comes from: boss kills
	// (default), trash, or either.
	On InstanceSearchOn `json:"on,omitempty"`
}

// InstanceSearchOn selects which fights per-fight player data (spec, role,
// dps, deaths, ...) is read from.
type InstanceSearchOn string

const (
	InstanceSearchOnBosses InstanceSearchOn = "bosses"
	InstanceSearchOnTrash  InstanceSearchOn = "trash"
	InstanceSearchOnAny    InstanceSearchOn = "any"
)

// InstanceSearchCount compares how many children satisfy Where. A nil Where
// counts all of them.
type InstanceSearchCount struct {
	Where *InstanceSearchNode `json:"where,omitempty"`
	Op    InstanceSearchOp    `json:"op"`
	Value int64               `json:"value"`
}

type InstanceSearchOp string

const (
	InstanceSearchOpEq    InstanceSearchOp = "="
	InstanceSearchOpNe    InstanceSearchOp = "!="
	InstanceSearchOpLt    InstanceSearchOp = "<"
	InstanceSearchOpLte   InstanceSearchOp = "<="
	InstanceSearchOpGt    InstanceSearchOp = ">"
	InstanceSearchOpGte   InstanceSearchOp = ">="
	InstanceSearchOpIn    InstanceSearchOp = "in"
	InstanceSearchOpNotIn InstanceSearchOp = "not_in"
	// InstanceSearchOpContains matches text fields containing the value,
	// ignoring case ("molten" matches "Molten Core").
	InstanceSearchOpContains InstanceSearchOp = "contains"
	// InstanceSearchOpStartsWith matches text fields starting with the value,
	// ignoring case.
	InstanceSearchOpStartsWith InstanceSearchOp = "starts_with"
	// InstanceSearchOpBetween matches numbers and times in [low, high],
	// inclusive on both ends. The value is a two-element list.
	InstanceSearchOpBetween InstanceSearchOp = "between"
)

type InstanceSearchMatch string

const (
	InstanceSearchMatchAny  InstanceSearchMatch = "any"
	InstanceSearchMatchEach InstanceSearchMatch = "each"
)

type InstanceSearchParseScope string

const (
	InstanceSearchParseScopeServer InstanceSearchParseScope = "server"
	InstanceSearchParseScopeRealm  InstanceSearchParseScope = "realm"
	InstanceSearchParseScopeGuild  InstanceSearchParseScope = "guild"
)

type InstanceSearchMetric string

const (
	InstanceSearchMetricDPS InstanceSearchMetric = "dps"
	InstanceSearchMetricHPS InstanceSearchMetric = "hps"
)

// InstanceSearchResult is one matching run.
type InstanceSearchResult struct {
	ID             uuid.UUID     `json:"id" format:"uuid"`
	Slug           string        `json:"slug,omitempty"`
	Name           string        `json:"name"`
	RealmID        uuid.UUID     `json:"realm_id" format:"uuid"`
	RealmName      string        `json:"realm_name"`
	GuildID        uuid.NullUUID `json:"guild_id" format:"uuid"`
	GuildName      string        `json:"guild_name,omitempty"`
	DifficultyName string        `json:"difficulty_name"`
	MaxPlayers     int32         `json:"max_players"`
	StartedAt      time.Time     `json:"started_at" format:"date-time"`
	// PlayerCount is the number of distinct players in the run.
	PlayerCount int64 `json:"player_count"`
	// BossesKilled is the number of distinct bosses killed (clean or partial).
	BossesKilled int64 `json:"bosses_killed"`
	// ClearTimeMS is the ranked full-clear time; absent when the run is not
	// a full clear.
	ClearTimeMS *int64 `json:"clear_time_ms,omitempty"`
}

// InstanceSearchLimitResponse is the caller's instance search rate-limit
// bucket, from GET /api/v1/raidlogs/search/limit. Searches spend tokens equal
// to their cost (the Chronicle-Search-Cost header).
type InstanceSearchLimitResponse struct {
	// LoggedIn is false for anonymous callers, who share a per-IP bucket and
	// may only run simple searches.
	LoggedIn bool `json:"logged_in"`
	// Limit is the bucket size: the most tokens that can be spent at once.
	Limit float64 `json:"limit"`
	// Remaining is the tokens available now.
	Remaining float64 `json:"remaining"`
	// RefillPerMinute is how many tokens come back each minute.
	RefillPerMinute float64 `json:"refill_per_minute"`
	// ResetSeconds is how long until the bucket is full.
	ResetSeconds int64 `json:"reset_seconds"`
}

// InstanceSearchFieldScope is where a field may be used in the tree.
type InstanceSearchFieldScope string

const (
	// InstanceSearchFieldScopeInstance fields are used outside quantifiers.
	InstanceSearchFieldScopeInstance InstanceSearchFieldScope = "instance"
	// InstanceSearchFieldScopePlayer fields are used inside any_player / count_players.
	InstanceSearchFieldScopePlayer InstanceSearchFieldScope = "player"
	// InstanceSearchFieldScopeEncounter fields are used inside any_encounter / count_encounters.
	InstanceSearchFieldScopeEncounter InstanceSearchFieldScope = "encounter"
)

// InstanceSearchField describes one searchable field, for building UIs.
type InstanceSearchField struct {
	Name  string                   `json:"name"`
	Scope InstanceSearchFieldScope `json:"scope"`
	// Type is int, float, string, bool, time, uuid or enum.
	Type string `json:"type"`
	// Enum lists the allowed values when Type is enum.
	Enum []string           `json:"enum,omitempty"`
	Ops  []InstanceSearchOp `json:"ops"`
	// Unit describes numbers, e.g. "ms" or "0-100".
	Unit string `json:"unit,omitempty"`
	Doc  string `json:"doc"`
	// Bosses: the field takes bosses + match.
	Bosses bool `json:"bosses"`
	// ParseScope: the field takes parse_scope.
	ParseScope bool `json:"parse_scope"`
	// Metric: the field takes metric.
	Metric bool `json:"metric"`
	// On: the field takes on (bosses, trash, any).
	On bool `json:"on"`
	// Anonymous: logged-out users may use this field.
	Anonymous bool `json:"anonymous"`
	// Cost is the field's weight in a query's cost.
	Cost int `json:"cost"`
}

// InstanceSearchFieldsResponse is GET /api/v1/raidlogs/search/fields.
type InstanceSearchFieldsResponse struct {
	Fields []InstanceSearchField      `json:"fields"`
	Sorts  []InstanceSearchSortOption `json:"sorts"`
	// MaxNodes and MaxDepth bound the size of a query tree.
	MaxNodes int `json:"max_nodes"`
	MaxDepth int `json:"max_depth"`
	// Anonymous limits: logged-out users may AND together at most this many
	// predicates on Anonymous fields, with no quantifiers, or or not.
	AnonymousMaxPredicates int `json:"anonymous_max_predicates"`
	AnonymousMaxLimit      int `json:"anonymous_max_limit"`
	// Cost weights, so UIs can show a query's cost before running it:
	// CostBase + each field's Cost + CostOr per or group + CostNot per not +
	// CostAny per any_player / any_encounter + CostCount per count_players /
	// count_encounters. and groups are free.
	CostBase  int `json:"cost_base"`
	CostOr    int `json:"cost_or"`
	CostNot   int `json:"cost_not"`
	CostAny   int `json:"cost_any"`
	CostCount int `json:"cost_count"`
}

// InstanceSearchResponse is one page of results.
type InstanceSearchResponse struct {
	Results []InstanceSearchResult `json:"results"`
	// Next is set when more results exist. Send it back as Cursor.
	Next *InstanceSearchCursor `json:"next,omitempty"`
}

// InstanceSearchExplainRequest is the body of POST
// /api/v1/raidlogs/search/explain: why one run does (or does not) match a
// search.
type InstanceSearchExplainRequest struct {
	// Query is the search. Only Where is used.
	Query      InstanceSearchQuery `json:"query"`
	InstanceID uuid.UUID           `json:"instance_id" format:"uuid"`
}

// InstanceSearchExplainResponse is the evidence for one run.
type InstanceSearchExplainResponse struct {
	// Matched is whether the run satisfies the whole search.
	Matched bool `json:"matched"`
	// Evidence mirrors the query tree node for node. Absent for an empty
	// search.
	Evidence *InstanceSearchEvidence `json:"evidence,omitempty"`
}

type InstanceSearchEvidenceKind string

const (
	InstanceSearchEvidenceAnd             InstanceSearchEvidenceKind = "and"
	InstanceSearchEvidenceOr              InstanceSearchEvidenceKind = "or"
	InstanceSearchEvidenceNot             InstanceSearchEvidenceKind = "not"
	InstanceSearchEvidenceField           InstanceSearchEvidenceKind = "field"
	InstanceSearchEvidenceAnyPlayer       InstanceSearchEvidenceKind = "any_player"
	InstanceSearchEvidenceCountPlayers    InstanceSearchEvidenceKind = "count_players"
	InstanceSearchEvidenceAnyEncounter    InstanceSearchEvidenceKind = "any_encounter"
	InstanceSearchEvidenceCountEncounters InstanceSearchEvidenceKind = "count_encounters"
)

// InstanceSearchEvidence explains one node of a search for one run. It has
// the same shape as the query: Children line up with And / Or / Not, and a
// witness's Evidence lines up with the quantifier's subtree.
type InstanceSearchEvidence struct {
	Kind InstanceSearchEvidenceKind `json:"kind"`
	// OK is whether the node holds. Null means unknown, the way SQL treats a
	// comparison with a missing value (e.g. clear time on a run that is not a
	// full clear); unknown never matches, even under not.
	OK *bool `json:"ok"`
	// Field is the predicate field (Kind field).
	Field string `json:"field,omitempty"`
	// Value is the run's value for a single-valued field. Absent when the run
	// has none.
	Value any `json:"value,omitempty"`
	// Rows are per-boss or per-fight values for fields read per fight (kill
	// times, parses, spec, dps, ...), limited to the requested bosses.
	Rows []InstanceSearchEvidenceRow `json:"rows,omitempty"`
	// Count is how many players or pulls satisfy a quantifier's subtree.
	Count *int64 `json:"count,omitempty"`
	// Witnesses are up to five of the players or pulls that satisfy a
	// quantifier's subtree.
	Witnesses []InstanceSearchWitness  `json:"witnesses,omitempty"`
	Children  []InstanceSearchEvidence `json:"children,omitempty"`
}

// InstanceSearchEvidenceRow is one fight's value for a per-fight field.
type InstanceSearchEvidenceRow struct {
	// Name is the boss or fight name ("Trash" for the aggregated trash row).
	Name  string `json:"name"`
	Value any    `json:"value"`
	OK    bool   `json:"ok"`
}

// InstanceSearchWitness is a player or pull that satisfies a quantifier.
type InstanceSearchWitness struct {
	// Name is the character or encounter name.
	Name string `json:"name"`
	// Players only.
	GUID  string `json:"guid,omitempty"`
	Class string `json:"class,omitempty"`
	// Encounters only.
	EncounterID uuid.NullUUID `json:"encounter_id" format:"uuid"`
	Outcome     string        `json:"outcome,omitempty"`
	DurationMS  int64         `json:"duration_ms,omitempty"`
	// Evidence explains the quantifier's subtree for this witness.
	Evidence *InstanceSearchEvidence `json:"evidence,omitempty"`
}
