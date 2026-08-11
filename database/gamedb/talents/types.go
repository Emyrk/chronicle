// Package talents provides the TalentFetcher for loading and caching
// pre-computed talent tree data from the database.
package talents

// TalentTreeData is the top-level JSON structure keyed by class ID.
// This matches the frontend's TalentTreeJSON type exactly.
type TalentTreeData struct {
	Classes map[int32]ClassTalentData `json:"classes"`
	Pets    map[int32]ClassTalentData `json:"pets,omitempty"`
}

// ClassTalentData holds the talent tabs (specs) for a single class.
type ClassTalentData struct {
	Tabs []TalentTabData `json:"tabs"`
}

// TalentTabData represents a single talent tree tab (e.g. "Arms" for Warrior).
type TalentTabData struct {
	ID             int32         `json:"id"`
	Name           string        `json:"name"`
	BackgroundFile string        `json:"backgroundFile"`
	OrderIndex     int32         `json:"orderIndex"`
	SpellIconID    int32         `json:"spellIconID"`
	IconTexture    string        `json:"iconTexture"`
	Talents        []TalentEntry `json:"talents"`
}

// TalentEntry represents a single talent within a tab.
type TalentEntry struct {
	ID           int32   `json:"id"`
	Name         string  `json:"name"`
	TierID       int32   `json:"tierID"`
	ColumnIndex  int32   `json:"columnIndex"`
	MaxRank      int32   `json:"maxRank"`
	TabIndex     int32   `json:"tabIndex"` // 0-based index within tab (sorted by tier, then column)
	SpellRanks   []int32 `json:"spellRanks"`
	PrereqTalent []int32 `json:"prereqTalent,omitempty"`
	PrereqRank   []int32 `json:"prereqRank,omitempty"`
	IconTexture  string  `json:"iconTexture"`
}
