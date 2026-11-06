package wdb

import "github.com/Emyrk/chronicle/database"

const syntheticTransmogEntryFloor int32 = 100000

// IsLikelySyntheticTransmog reports whether observed has the shape used by
// Nightmare of Ursol's client-visible transmog templates. The synthetic item
// copies a real low-ID item's template, then changes its entry, display, and
// binding. Unreliable WDB spell metadata is ignored.
func IsLikelySyntheticTransmog(observed, candidate database.WorldItemTemplate) bool {
	if observed.Entry < syntheticTransmogEntryFloor ||
		candidate.Entry >= syntheticTransmogEntryFloor ||
		observed.Entry == candidate.Entry ||
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
