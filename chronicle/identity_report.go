package chronicle

import (
	"slices"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// Use the final zone-resolved catalogue, not the collector's missing-name
// observation counters. Counts are distinct GUIDs within this instance.
func buildIdentityInstance(name, zone string, finalized *instances.FinalizedInstance, units *unitdb.Units, idf *identifier.Identifier) chroniclesdk.IdentityInstance {
	report := chroniclesdk.IdentityInstance{Name: name, Zone: zone, Units: []chroniclesdk.IdentityUnit{}}
	type key struct {
		category unitdb.Category
		entry    uint32
	}
	grouped := make(map[key]*chroniclesdk.IdentityUnit)
	ids := slices.Clone(finalized.PersistedUnits)
	slices.Sort(ids)
	ids = slices.Compact(ids)
	for _, id := range ids {
		if id == guid.GUID(0) {
			continue
		}
		category := finalized.UnitCategories[id]
		if category == "" {
			category = unitdb.CategoryUnknown
		}
		var entry uint32
		// Pet GUID entry bits are not creature template IDs.
		if !id.IsPet() {
			entry, _ = id.GetEntry()
		}
		k := key{category, entry}
		u := grouped[k]
		if u == nil {
			u = &chroniclesdk.IdentityUnit{Category: string(category), EntryID: entry, Samples: []string{}}
			grouped[k] = u
		}
		if info, ok := units.Get(id); ok && u.Name == "" {
			u.Name = info.Name
		}
		if idf != nil {
			u.Boss = u.Boss || idf.IdentifyUnit(id).Boss
		}
		u.UniqueCount++
		if len(u.Samples) < 3 {
			u.Samples = append(u.Samples, id.String())
		}
	}
	for _, u := range grouped {
		report.Units = append(report.Units, *u)
	}
	slices.SortFunc(report.Units, func(a, b chroniclesdk.IdentityUnit) int {
		if a.Category != b.Category {
			if a.Category == string(unitdb.CategoryUnknown) {
				return -1
			}
			if b.Category == string(unitdb.CategoryUnknown) {
				return 1
			}
			if a.Category < b.Category {
				return -1
			}
			return 1
		}
		if a.EntryID < b.EntryID {
			return -1
		}
		if a.EntryID > b.EntryID {
			return 1
		}
		return 0
	})
	return report
}
