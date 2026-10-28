package chroniclesdk

// SupportedInstanceUnit is a hostile creature in a supported instance.
type SupportedInstanceUnit struct {
	EntryID uint32 `json:"entry_id"`
	Name    string `json:"name"`
}

// RankingEncounterSet is a named encounter group available on rankings pages.
// The set with an empty ID is the default and is omitted from URLs.
type RankingEncounterSet struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	Encounters []string `json:"encounters"`
}

// SupportedInstanceDamageRule selects the ranked targets for an encounter.
type SupportedInstanceDamageRule struct {
	Mode     string   `json:"mode"`
	EntryIDs []uint32 `json:"entry_ids,omitempty"`
}

// SupportedInstanceSpeedrunRules lists the requirements for a qualifying clear.
type SupportedInstanceSpeedrunRules struct {
	Requirements                []SpeedrunRequirement          `json:"requirements"`
	LevelRange                  *SpeedrunLevelRangeRequirement `json:"level_range,omitempty"`
	RankedStartAfterRequirement string                         `json:"ranked_start_after_requirement,omitempty"`
}

// SupportedInstance describes a registered instance with its metadata.
type SupportedInstance struct {
	Name                         string                                    `json:"name"`
	Comment                      string                                    `json:"comment,omitempty"`
	Category                     string                                    `json:"category"`
	Fallback                     bool                                      `json:"fallback,omitempty"`
	ZoneNames                    []string                                  `json:"zone_names,omitempty"`
	DerivedNames                 []string                                  `json:"derived_names,omitempty"`
	BossCount                    *int                                      `json:"boss_count,omitempty"`
	ProgressionBosses            []string                                  `json:"progression_bosses,omitempty"`
	RankingEncounterSets         []RankingEncounterSet                     `json:"ranking_encounter_sets,omitempty"`
	DamageByEncounter            map[string]SupportedInstanceDamageRule    `json:"damage_by_encounter,omitempty"`
	SpeedrunRules                *SupportedInstanceSpeedrunRules           `json:"speedrun_rules,omitempty"`
	DerivedSpeedrunRules         map[string]SupportedInstanceSpeedrunRules `json:"derived_speedrun_rules,omitempty"`
	RaidProgressionOrder         int                                       `json:"raid_progression_order,omitempty"`
	DerivedRaidProgressionOrders map[string]int                            `json:"derived_raid_progression_orders,omitempty"`
	RankedStartAfterRequirement  string                                    `json:"ranked_start_after_requirement,omitempty"`
	Bosses                       []SupportedInstanceUnit                   `json:"bosses,omitempty"`
	Trash                        []SupportedInstanceUnit                   `json:"trash,omitempty"`
}
