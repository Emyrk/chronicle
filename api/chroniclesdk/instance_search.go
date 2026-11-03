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
	// Limit is the page size. Zero uses the default (25).
	Limit int `json:"limit,omitempty"`
	// Cursor continues from a previous page's Next.
	Cursor *InstanceSearchCursor `json:"cursor,omitempty"`
}

// InstanceSearchCursor is a keyset pagination position. Results are ordered
// by (started_at DESC, id DESC).
type InstanceSearchCursor struct {
	StartedAt time.Time `json:"started_at" format:"date-time"`
	ID        uuid.UUID `json:"id" format:"uuid"`
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
	// Value is a string, number, boolean, or a list for in / not_in.
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
	Fields []InstanceSearchField `json:"fields"`
	// MaxNodes and MaxDepth bound the size of a query tree.
	MaxNodes int `json:"max_nodes"`
	MaxDepth int `json:"max_depth"`
	// Anonymous limits: logged-out users may AND together at most this many
	// predicates on Anonymous fields, with no quantifiers, or or not.
	AnonymousMaxPredicates int `json:"anonymous_max_predicates"`
	AnonymousMaxLimit      int `json:"anonymous_max_limit"`
}

// InstanceSearchResponse is one page of results.
type InstanceSearchResponse struct {
	Results []InstanceSearchResult `json:"results"`
	// Next is set when more results exist. Send it back as Cursor.
	Next *InstanceSearchCursor `json:"next,omitempty"`
}
