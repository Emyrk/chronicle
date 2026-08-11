package cli

import (
	"github.com/Emyrk/chronicle/database/gamedb/talents"
)

// convertToExportedTypes converts the internal script talent types to the
// exported talents package types used by the fetcher/API.
func convertToExportedTypes(data *talentTreeData) *talents.TalentTreeData {
	return &talents.TalentTreeData{
		Classes: convertTalentDataMap(data.Classes),
		Pets:    convertTalentDataMap(data.Pets),
	}
}

func convertTalentDataMap(data map[int32]classTalentData) map[int32]talents.ClassTalentData {
	result := make(map[int32]talents.ClassTalentData, len(data))
	for id, tree := range data {
		var tabs []talents.TalentTabData
		for _, tab := range tree.Tabs {
			var entries []talents.TalentEntry
			for _, e := range tab.Talents {
				entries = append(entries, talents.TalentEntry{
					ID:           e.ID,
					Name:         e.Name,
					TierID:       e.TierID,
					ColumnIndex:  e.ColumnIndex,
					MaxRank:      e.MaxRank,
					TabIndex:     e.TabIndex,
					SpellRanks:   e.SpellRanks,
					PrereqTalent: e.PrereqTalent,
					PrereqRank:   e.PrereqRank,
					IconTexture:  e.IconTexture,
				})
			}
			tabs = append(tabs, talents.TalentTabData{
				ID:             tab.ID,
				Name:           tab.Name,
				BackgroundFile: tab.BackgroundFile,
				OrderIndex:     tab.OrderIndex,
				SpellIconID:    tab.SpellIconID,
				IconTexture:    tab.IconTexture,
				Talents:        entries,
			})
		}
		result[id] = talents.ClassTalentData{Tabs: tabs}
	}
	return result
}
