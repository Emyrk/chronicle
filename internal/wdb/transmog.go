package wdb

import (
	"cmp"
	"slices"

	"github.com/Emyrk/chronicle/database"
)

const syntheticTransmogEntryFloor int32 = 100000

func IsPossibleSyntheticTransmogEntry(entry int32) bool {
	return entry >= syntheticTransmogEntryFloor
}

// IsLikelySyntheticTransmog reports whether observed has the shape used by
// Nightmare of Ursol's client-visible transmog templates. The synthetic item
// copies a lower-entry item's template, then changes its entry and display.
// Unreliable WDB spell metadata and binding differences are ignored.
func IsLikelySyntheticTransmog(observed, candidate database.WorldItemTemplate) bool {
	if !IsPossibleSyntheticTransmogEntry(observed.Entry) ||
		candidate.Entry >= observed.Entry ||
		observed.Name == "" || observed.Name != candidate.Name ||
		observed.Bonding != 1 { // BIND_WHEN_PICKED_UP
		return false
	}

	for _, diff := range CompareItems(observed, candidate) {
		if diff.Unreliable || diff.Field == "display_id" || diff.Field == "bonding" {
			continue
		}
		return false
	}
	return true
}

// SyntheticTransmogEntries groups items by name and identifies higher entries
// that are template clones of a lower entry. This keeps the lowest matching
// entry as the canonical item while allowing legitimate same-name items with
// different gameplay properties to coexist.
func SyntheticTransmogEntries(items []database.WorldItemTemplate) map[int32]struct{} {
	groups := make(map[string]map[int32]database.WorldItemTemplate)
	for _, item := range items {
		if item.Name == "" {
			continue
		}
		byEntry := groups[item.Name]
		if byEntry == nil {
			byEntry = make(map[int32]database.WorldItemTemplate)
			groups[item.Name] = byEntry
		}
		byEntry[item.Entry] = item
	}

	synthetic := make(map[int32]struct{})
	for _, byEntry := range groups {
		group := make([]database.WorldItemTemplate, 0, len(byEntry))
		for _, item := range byEntry {
			group = append(group, item)
		}
		slices.SortFunc(group, func(a, b database.WorldItemTemplate) int {
			return cmp.Compare(a.Entry, b.Entry)
		})

		for i := 1; i < len(group); i++ {
			for j := 0; j < i; j++ {
				if IsLikelySyntheticTransmog(group[i], group[j]) {
					synthetic[group[i].Entry] = struct{}{}
					break
				}
			}
		}
	}
	return synthetic
}
