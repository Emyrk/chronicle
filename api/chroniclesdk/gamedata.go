package chroniclesdk

// WDBUploadResponse is the response from uploading a WDB cache file.
type WDBUploadResponse struct {
	Signature   string        `json:"signature"`
	Version     uint32        `json:"version"`
	RecordCount int           `json:"record_count"`
	Mode        string        `json:"mode"`
	NewItems    int           `json:"new_items"`
	Changed     int           `json:"changed"`
	Unchanged   int           `json:"unchanged"`
	Diffs       []WDBItemDiff `json:"diffs"`
}

// WDBItemDiff describes changes for one item entry.
type WDBItemDiff struct {
	Entry  int32          `json:"entry"`
	Name   string         `json:"name"`
	Status string         `json:"status"` // "new", "changed", "unchanged"
	Fields []WDBFieldDiff `json:"fields,omitempty"`
}

// WDBFieldDiff describes a single changed field.
type WDBFieldDiff struct {
	Field      string `json:"field"`
	Old        any    `json:"old"`
	New        any    `json:"new"`
	Unreliable bool   `json:"unreliable,omitempty"`
}

// CreatureSearchResult is a lightweight creature summary for search results.
type CreatureSearchResult struct {
	Entry     int32   `json:"entry"`
	Name      string  `json:"name"`
	Subname   string  `json:"subname"`
	LevelMin  int32   `json:"level_min"`
	LevelMax  int32   `json:"level_max"`
	HealthMin int32   `json:"health_min"`
	HealthMax int32   `json:"health_max"`
	ManaMin   int32   `json:"mana_min"`
	ManaMax   int32   `json:"mana_max"`
	Armor     int32   `json:"armor"`
	DmgMin    float64 `json:"dmg_min"`
	DmgMax    float64 `json:"dmg_max"`
	UnitClass int32   `json:"unit_class"`
}

// ItemSetSearchResult is a summary for item set search results.
// EnchantmentSearchResult is one enchantment matched by name. The same
// display name can exist at several IDs (ranks), so both are returned.
type EnchantmentSearchResult struct {
	ID   int32  `json:"id"`
	Name string `json:"name"`
}

type ItemSetSearchResult struct {
	ID                int32  `json:"id"`
	Name              string `json:"name"`
	RequiredSkill     int32  `json:"required_skill"`
	RequiredSkillRank int32  `json:"required_skill_rank"`
	PieceCount        int32  `json:"piece_count"`
	BonusCount        int32  `json:"bonus_count"`
	MaxQuality        int32  `json:"max_quality"`
	FirstItemEntry    int32  `json:"first_item_entry"`
}

// ItemSetDetail is a full item set with pieces and bonuses.
type ItemSetDetail struct {
	ID                int32              `json:"id"`
	Name              string             `json:"name"`
	RequiredSkill     int32              `json:"required_skill"`
	RequiredSkillRank int32              `json:"required_skill_rank"`
	Pieces            []ItemSetPieceInfo `json:"pieces"`
	Bonuses           []ItemSetBonus     `json:"bonuses"`
}

// ItemSetPieceInfo is an item in a set with display info.
type ItemSetPieceInfo struct {
	Entry         int32  `json:"entry"`
	Name          string `json:"name"`
	Quality       int32  `json:"quality"`
	InventoryType int32  `json:"inventory_type"`
	Icon          string `json:"icon"`
}

// ItemSearchResult is a lightweight item summary for search results.
type ItemSearchResult struct {
	Entry             int32   `json:"entry"`
	Name              string  `json:"name"`
	Quality           int32   `json:"quality"`
	InventoryType     int32   `json:"inventory_type"`
	Class             int32   `json:"class"`
	SubClass          int32   `json:"subclass"`
	ItemLevel         int32   `json:"item_level"`
	RequiredLevel     int32   `json:"required_level"`
	Delay             int32   `json:"delay"`
	DmgMin1           float64 `json:"dmg_min1"`
	DmgMax1           float64 `json:"dmg_max1"`
	ContainerSlots    int32   `json:"container_slots"`
	RequiredSkill     int32   `json:"required_skill"`
	RequiredSkillRank int32   `json:"required_skill_rank"`
	Armor             int32   `json:"armor"`
	GemEnchantID      int32   `json:"gem_enchant_id,omitempty"`
	Icon              string  `json:"icon"`
}

// DBCUploadResponse is the response from uploading a DBC file.
type DBCUploadResponse struct {
	DBCName     string `json:"dbc_name"`
	RecordCount int    `json:"record_count"`
	Mode        string `json:"mode"`
	Inserted    int    `json:"inserted"`
	Updated     int    `json:"updated"`
	Unchanged   int    `json:"unchanged"`
}
