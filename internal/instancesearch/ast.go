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
// See docs/instance-search.md for the design and .agents/skills/instance-search
// for how to write queries.
package instancesearch

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Query is a full search request.
type Query struct {
	// Where is the search tree. Nil matches every visible instance.
	Where *Node `json:"where,omitempty"`
	// Limit is the page size. Zero uses DefaultLimit.
	Limit int `json:"limit,omitempty"`
	// Cursor continues from the last row of a previous page.
	Cursor *Cursor `json:"cursor,omitempty"`
}

// Cursor is a keyset pagination position. Results are ordered by
// (started_at DESC, id DESC).
type Cursor struct {
	StartedAt time.Time `json:"started_at"`
	ID        uuid.UUID `json:"id"`
}

// Node is one node of the search tree. Exactly one of the following must be
// set: And, Or, Not, AnyPlayer, CountPlayers, AnyEncounter, CountEncounters,
// or Field (a predicate).
type Node struct {
	And []Node `json:"and,omitempty"`
	Or  []Node `json:"or,omitempty"`
	Not *Node  `json:"not,omitempty"`

	// AnyPlayer matches when one player in the instance satisfies the
	// subtree. All predicates in the subtree refer to that same player.
	AnyPlayer *Node `json:"any_player,omitempty"`
	// CountPlayers compares the number of distinct players that satisfy the
	// subtree.
	CountPlayers *Count `json:"count_players,omitempty"`
	// AnyEncounter matches when one encounter (pull) satisfies the subtree.
	AnyEncounter *Node `json:"any_encounter,omitempty"`
	// CountEncounters compares the number of encounters (pulls) that satisfy
	// the subtree.
	CountEncounters *Count `json:"count_encounters,omitempty"`

	// Predicate. Field names a registry entry, e.g. "player.class".
	Field string          `json:"field,omitempty"`
	Op    Op              `json:"op,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
	// Bosses restricts boss-based predicates to these encounter names.
	Bosses []string `json:"bosses,omitempty"`
	// Match is "any" (default) or "each" for predicates that take Bosses.
	Match Match `json:"match,omitempty"`
	// ParseScope selects the time-parse cohort: server (default), realm or
	// guild.
	ParseScope ParseScope `json:"parse_scope,omitempty"`
	// Metric selects the player parse metric: dps (default) or hps.
	Metric Metric `json:"metric,omitempty"`
}

// Count compares how many children satisfy Where. A nil Where counts all.
type Count struct {
	Where *Node `json:"where,omitempty"`
	Op    Op    `json:"op"`
	Value int64 `json:"value"`
}

// Op is a comparison operator.
type Op string

const (
	OpEq    Op = "="
	OpNe    Op = "!="
	OpLt    Op = "<"
	OpLte   Op = "<="
	OpGt    Op = ">"
	OpGte   Op = ">="
	OpIn    Op = "in"
	OpNotIn Op = "not_in"
)

// Match controls how a boss list is applied.
type Match string

const (
	// MatchAny is satisfied by any one of the bosses (or any boss when the
	// list is empty).
	MatchAny Match = "any"
	// MatchEach requires every listed boss to satisfy the predicate.
	MatchEach Match = "each"
)

// ParseScope selects which time-parse cohort a score comes from.
type ParseScope string

const (
	ParseScopeServer ParseScope = "server"
	ParseScopeRealm  ParseScope = "realm"
	ParseScopeGuild  ParseScope = "guild"
)

// Metric selects a player parse metric.
type Metric string

const (
	MetricDPS Metric = "dps"
	MetricHPS Metric = "hps"
)
