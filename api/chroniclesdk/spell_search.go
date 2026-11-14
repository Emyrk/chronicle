package chroniclesdk

// SpellSearchRequest is the body of POST /api/v1/wowdb/spells/search.
type SpellSearchRequest struct {
	Context SpellSearchContext `json:"context"`
	Where   *SpellSearchNode   `json:"where,omitempty"`
	Limit   int                `json:"limit,omitempty"`
	Cursor  *SpellSearchCursor `json:"cursor,omitempty"`
}

// SpellSearchContext selects the spell variant and optional level used while
// evaluating effect values. Difficulty defaults to zero.
type SpellSearchContext struct {
	Level      *int32 `json:"level"`
	Difficulty int32  `json:"difficulty"`
}

// SpellSearchNode is one node of the search tree. Exactly one of And, Or, Not,
// AnyEffect, AnyPower or Field must be set.
type SpellSearchNode struct {
	And []SpellSearchNode `json:"and,omitempty"`
	Or  []SpellSearchNode `json:"or,omitempty"`
	Not *SpellSearchNode  `json:"not,omitempty"`

	// AnyEffect matches when one resolved-difficulty effect row satisfies the
	// subtree. Every predicate in the subtree refers to that same effect row.
	AnyEffect *SpellSearchNode `json:"any_effect,omitempty"`
	// AnyPower matches when one power row satisfies the subtree. Every predicate
	// in the subtree refers to that same power row.
	AnyPower *SpellSearchNode `json:"any_power,omitempty"`

	Field string        `json:"field,omitempty"`
	Op    SpellSearchOp `json:"op,omitempty"`
	Value any           `json:"value,omitempty"`
}

type SpellSearchOp string

const (
	SpellSearchOpEq       SpellSearchOp = "="
	SpellSearchOpNe       SpellSearchOp = "!="
	SpellSearchOpLt       SpellSearchOp = "<"
	SpellSearchOpLte      SpellSearchOp = "<="
	SpellSearchOpGt       SpellSearchOp = ">"
	SpellSearchOpGte      SpellSearchOp = ">="
	SpellSearchOpContains SpellSearchOp = "contains"
	SpellSearchOpIn       SpellSearchOp = "in"
	SpellSearchOpHas      SpellSearchOp = "has"
)

// SpellSearchCursor is the last spell ID from the previous page.
type SpellSearchCursor struct {
	SpellID int32 `json:"spell_id"`
}

// SpellSearchResult is one lightweight WoWDB spell row.
type SpellSearchResult struct {
	ID          int32  `json:"id"`
	Name        string `json:"name"`
	Subtext     string `json:"subtext"`
	Description string `json:"description"`
	SpellLevel  int32  `json:"spell_level"`
	BaseLevel   int32  `json:"base_level"`
	School      int32  `json:"school"`
	SpellIconID int32  `json:"spell_icon_id"`
}

// SpellSearchResponse is one page ordered by spell ID ascending.
type SpellSearchResponse struct {
	Results []SpellSearchResult `json:"results"`
	Next    *SpellSearchCursor  `json:"next,omitempty"`
}

// SpellSearchLimitResponse describes the shared advanced-search bucket.
type SpellSearchLimitResponse struct {
	LoggedIn        bool    `json:"logged_in"`
	Allowed         bool    `json:"allowed"`
	RequiredTier    string  `json:"required_tier"`
	Limit           float64 `json:"limit"`
	Remaining       float64 `json:"remaining"`
	RefillPerMinute float64 `json:"refill_per_minute"`
	ResetSeconds    int64   `json:"reset_seconds"`
}
