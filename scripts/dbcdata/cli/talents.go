package cli

import (
	"fmt"
	"sort"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
)

// talentTreeData is the top-level JSON structure keyed by class ID.
type talentTreeData struct {
	Classes map[int32]classTalentData `json:"classes"`
}

type classTalentData struct {
	Tabs []talentTabData `json:"tabs"`
}

type talentTabData struct {
	ID              int32            `json:"id"`
	Name            string           `json:"name"`
	BackgroundFile  string           `json:"backgroundFile"`
	OrderIndex      int32            `json:"orderIndex"`
	SpellIconID     int32            `json:"spellIconID"`
	IconTexture     string           `json:"iconTexture"`
	Talents         []talentEntry    `json:"talents"`
}

type talentEntry struct {
	ID          int32   `json:"id"`
	TierID      int32   `json:"tierID"`
	ColumnIndex int32   `json:"columnIndex"`
	MaxRank     int32   `json:"maxRank"`
	TabIndex    int32   `json:"tabIndex"` // 0-based index within tab (sorted by tier, then column)
	SpellRanks  []int32 `json:"spellRanks"` // spell ID per rank (rank 1 = index 0)
	PrereqTalent []int32 `json:"prereqTalent,omitempty"`
	PrereqRank   []int32 `json:"prereqRank,omitempty"`
	IconTexture string  `json:"iconTexture"`
}

// classMaskToIDs converts a bitmask to class IDs (1=Warrior, 2=Paladin, etc.)
func classMaskToIDs(mask int32) []int32 {
	var ids []int32
	for i := int32(0); i < 12; i++ {
		if mask&(1<<i) != 0 {
			ids = append(ids, i+1)
		}
	}
	return ids
}

func collectTalentTrees(wc *dbcdb.WoWClient) (*talentTreeData, error) {
	talentsDBC, err := wc.Talent()
	if err != nil {
		return nil, fmt.Errorf("read talents: %w", err)
	}

	tabsDBC, err := wc.TalentTab()
	if err != nil {
		return nil, fmt.Errorf("read talent tabs: %w", err)
	}

	iconsDBC, err := wc.SpellIcons()
	if err != nil {
		return nil, fmt.Errorf("read spell icons: %w", err)
	}

	spellsDBC, err := wc.Spells()
	if err != nil {
		return nil, fmt.Errorf("read spells: %w", err)
	}

	// Build icon lookup
	iconMap := make(map[int32]string)
	err = iconsDBC.Range(func(cursor *dbdefs.Ent_SpellIcon) bool {
		name := cursor.TextureFilename
		// Strip prefix like the spellicons generator does
		name = cutIconPrefix(name)
		iconMap[cursor.ID] = name
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate spell icons: %w", err)
	}

	// Build spell icon lookup (spell ID -> icon texture)
	spellIconMap := make(map[int32]string)
	err = spellsDBC.Range(func(cursor *dbdefs.Ent_Spell) bool {
		if cursor.SpellIconID != 0 {
			if tex, ok := iconMap[cursor.SpellIconID]; ok {
				spellIconMap[cursor.ID] = tex
			}
		}
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate spells for icons: %w", err)
	}

	// Collect tabs
	type tabInfo struct {
		dbdefs.Ent_TalentTab
		classIDs []int32
	}
	tabs := make(map[int32]*tabInfo)
	err = tabsDBC.Range(func(cursor *dbdefs.Ent_TalentTab) bool {
		ti := &tabInfo{Ent_TalentTab: *cursor}
		ti.classIDs = classMaskToIDs(cursor.ClassMask)
		tabs[cursor.ID] = ti
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate talent tabs: %w", err)
	}

	// Collect talents grouped by tab
	type rawTalent struct {
		dbdefs.Ent_Talent
	}
	talentsByTab := make(map[int32][]rawTalent)
	err = talentsDBC.Range(func(cursor *dbdefs.Ent_Talent) bool {
		talentsByTab[cursor.TabID] = append(talentsByTab[cursor.TabID], rawTalent{*cursor})
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate talents: %w", err)
	}

	// Sort talents within each tab by tier then column, assign tabIndex
	for tabID, talents := range talentsByTab {
		sort.Slice(talents, func(i, j int) bool {
			if talents[i].TierID != talents[j].TierID {
				return talents[i].TierID < talents[j].TierID
			}
			return talents[i].ColumnIndex < talents[j].ColumnIndex
		})
		talentsByTab[tabID] = talents
	}

	// Build per-class data
	result := &talentTreeData{
		Classes: make(map[int32]classTalentData),
	}

	for tabID, tab := range tabs {
		talents := talentsByTab[tabID]
		if len(tab.classIDs) == 0 {
			continue // pet talents, skip
		}

		var entries []talentEntry
		for i, t := range talents {
			// Count max rank from SpellRank slice (non-zero entries)
			var spellRanks []int32
			for _, sid := range t.SpellRank {
				if sid == 0 {
					break
				}
				spellRanks = append(spellRanks, sid)
			}
			maxRank := int32(len(spellRanks))
			if maxRank == 0 {
				continue
			}

			// Get icon from first rank spell
			iconTex := ""
			if len(spellRanks) > 0 {
				iconTex = spellIconMap[spellRanks[0]]
			}

			entry := talentEntry{
				ID:          t.ID,
				TierID:      t.TierID,
				ColumnIndex: t.ColumnIndex,
				MaxRank:     maxRank,
				TabIndex:    int32(i),
				SpellRanks:  spellRanks,
				IconTexture: iconTex,
			}

			// Prereqs
			for pi, prereqID := range t.PrereqTalent {
				if prereqID == 0 {
					break
				}
				entry.PrereqTalent = append(entry.PrereqTalent, prereqID)
				if pi < len(t.PrereqRank) {
					entry.PrereqRank = append(entry.PrereqRank, t.PrereqRank[pi])
				}
			}

			entries = append(entries, entry)
		}

		tabData := talentTabData{
			ID:             tabID,
			Name:           tab.Name_lang.String(),
			BackgroundFile: tab.BackgroundFile,
			OrderIndex:     tab.OrderIndex,
			SpellIconID:    tab.SpellIconID,
			IconTexture:    iconMap[tab.SpellIconID],
			Talents:        entries,
		}

		for _, classID := range tab.classIDs {
			cd := result.Classes[classID]
			cd.Tabs = append(cd.Tabs, tabData)
			result.Classes[classID] = cd
		}
	}

	// Sort tabs by OrderIndex within each class
	for classID, cd := range result.Classes {
		sort.Slice(cd.Tabs, func(i, j int) bool {
			return cd.Tabs[i].OrderIndex < cd.Tabs[j].OrderIndex
		})
		result.Classes[classID] = cd
	}

	return result, nil
}
