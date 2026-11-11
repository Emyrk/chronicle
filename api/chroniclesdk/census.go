package chroniclesdk

import "github.com/Emyrk/chronicle/combatlog/parser/types"

// CensusEntry represents a count of unique players for a class, race, and observed faction.
type CensusEntry struct {
	Class   string             `json:"class"`
	Race    string             `json:"race"`
	Faction *types.HeroFaction `json:"faction,omitempty"`
	Count   int64              `json:"count"`
}
