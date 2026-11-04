// Package instancesearch compiles a user-supplied search tree into a single
// parameterized SQL query that finds raid/dungeon instances.
//
// The tree is open but bounded: users combine predicates from a fixed
// registry (see fields.go) with and/or/not and scoped quantifiers
// (any_player, count_players, any_encounter, count_encounters). User input
// never becomes SQL text. Field names select a hand-written SQL template and
// every value is sent as a bind parameter.
//
// Every compiled query is wrapped in a fixed frame (see compile.go) that
// joins wow_server_realms so tenant row-level security applies, hides
// unfinalized, unlisted and invalidated logs, and collapses duplicate uploads
// to one result. The tree cannot alter the frame.
//
// The wire types live in chroniclesdk (so TypeScript types are generated);
// this package aliases them.
//
// See docs/instance-search.md for the design and .agents/skills/instance-search
// for how to write queries.
package instancesearch

import "github.com/Emyrk/chronicle/api/chroniclesdk"

type (
	Query         = chroniclesdk.InstanceSearchQuery
	Sort          = chroniclesdk.InstanceSearchSort
	SortField     = chroniclesdk.InstanceSearchSortField
	SortDirection = chroniclesdk.InstanceSearchSortDirection
	Cursor        = chroniclesdk.InstanceSearchCursor
	Node          = chroniclesdk.InstanceSearchNode
	Count         = chroniclesdk.InstanceSearchCount
	Op            = chroniclesdk.InstanceSearchOp
	Match         = chroniclesdk.InstanceSearchMatch
	ParseScope    = chroniclesdk.InstanceSearchParseScope
	Metric        = chroniclesdk.InstanceSearchMetric
	On            = chroniclesdk.InstanceSearchOn
	Result        = chroniclesdk.InstanceSearchResult
	Page          = chroniclesdk.InstanceSearchResponse
)

const (
	OpEq    = chroniclesdk.InstanceSearchOpEq
	OpNe    = chroniclesdk.InstanceSearchOpNe
	OpLt    = chroniclesdk.InstanceSearchOpLt
	OpLte   = chroniclesdk.InstanceSearchOpLte
	OpGt    = chroniclesdk.InstanceSearchOpGt
	OpGte   = chroniclesdk.InstanceSearchOpGte
	OpIn    = chroniclesdk.InstanceSearchOpIn
	OpNotIn = chroniclesdk.InstanceSearchOpNotIn

	OpContains   = chroniclesdk.InstanceSearchOpContains
	OpStartsWith = chroniclesdk.InstanceSearchOpStartsWith
	OpBetween    = chroniclesdk.InstanceSearchOpBetween

	MatchAny  = chroniclesdk.InstanceSearchMatchAny
	MatchEach = chroniclesdk.InstanceSearchMatchEach

	ParseScopeServer = chroniclesdk.InstanceSearchParseScopeServer
	ParseScopeRealm  = chroniclesdk.InstanceSearchParseScopeRealm
	ParseScopeGuild  = chroniclesdk.InstanceSearchParseScopeGuild

	MetricDPS = chroniclesdk.InstanceSearchMetricDPS
	MetricHPS = chroniclesdk.InstanceSearchMetricHPS

	SortStartedAt    = chroniclesdk.InstanceSearchSortStartedAt
	SortName         = chroniclesdk.InstanceSearchSortName
	SortRealm        = chroniclesdk.InstanceSearchSortRealm
	SortGuild        = chroniclesdk.InstanceSearchSortGuild
	SortDifficulty   = chroniclesdk.InstanceSearchSortDifficulty
	SortMaxPlayers   = chroniclesdk.InstanceSearchSortMaxPlayers
	SortPlayerCount  = chroniclesdk.InstanceSearchSortPlayerCount
	SortBossesKilled = chroniclesdk.InstanceSearchSortBossesKilled
	SortDeaths       = chroniclesdk.InstanceSearchSortDeaths
	SortWipes        = chroniclesdk.InstanceSearchSortWipes
	SortClearTime    = chroniclesdk.InstanceSearchSortClearTime
	SortIdleTime     = chroniclesdk.InstanceSearchSortIdleTime
	SortBossTime     = chroniclesdk.InstanceSearchSortBossTime
	SortKillTime     = chroniclesdk.InstanceSearchSortKillTime
	SortClearParse   = chroniclesdk.InstanceSearchSortClearParse

	SortAsc  = chroniclesdk.InstanceSearchSortAsc
	SortDesc = chroniclesdk.InstanceSearchSortDesc

	OnBosses = chroniclesdk.InstanceSearchOnBosses
	OnTrash  = chroniclesdk.InstanceSearchOnTrash
	OnAny    = chroniclesdk.InstanceSearchOnAny
)
