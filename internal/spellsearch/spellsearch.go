// Package spellsearch compiles and executes bounded, parameterized searches
// over one game-data spell dataset.
package spellsearch

import "github.com/Emyrk/chronicle/api/chroniclesdk"

type (
	Query   = chroniclesdk.SpellSearchRequest
	Context = chroniclesdk.SpellSearchContext
	Node    = chroniclesdk.SpellSearchNode
	Op      = chroniclesdk.SpellSearchOp
	Cursor  = chroniclesdk.SpellSearchCursor
	Result  = chroniclesdk.SpellSearchResult
	Page    = chroniclesdk.SpellSearchResponse
)

const (
	OpEq       = chroniclesdk.SpellSearchOpEq
	OpNe       = chroniclesdk.SpellSearchOpNe
	OpLt       = chroniclesdk.SpellSearchOpLt
	OpLte      = chroniclesdk.SpellSearchOpLte
	OpGt       = chroniclesdk.SpellSearchOpGt
	OpGte      = chroniclesdk.SpellSearchOpGte
	OpContains = chroniclesdk.SpellSearchOpContains
	OpIn       = chroniclesdk.SpellSearchOpIn
	OpHas      = chroniclesdk.SpellSearchOpHas
)
