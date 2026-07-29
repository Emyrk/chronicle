package chroniclesdk

// SupportedInstanceUnit is a hostile creature in a supported instance.
type SupportedInstanceUnit struct {
	EntryID uint32 `json:"entry_id"`
	Name    string `json:"name"`
}

// SupportedInstance describes a registered instance with its metadata.
type SupportedInstance struct {
	Name      string                  `json:"name"`
	Comment   string                  `json:"comment,omitempty"`
	Fallback  bool                    `json:"fallback,omitempty"`
	ZoneNames []string                `json:"zone_names,omitempty"`
	BossCount *int                    `json:"boss_count,omitempty"`
	Bosses    []SupportedInstanceUnit `json:"bosses,omitempty"`
	Trash     []SupportedInstanceUnit `json:"trash,omitempty"`
}
