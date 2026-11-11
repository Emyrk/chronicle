// Package critters owns the shared, known critter entry labels. Lookup does not
// classify a GUID: callers must first establish that the entity is a creature.
package critters

var names = map[uint32]string{
	4075:  "Rat",
	7395:  "Cockroach",
	4076:  "Roach",
	2914:  "Snake",
	883:   "Deer",
	1420:  "Toad",
	16030: "Maggot",
	3835:  "Biletoad",
	14881: "Spider",
	10441: "Plagued Rat",
	13321: "Frog",
	3680:  "Serpentbloom Snake",
	15010: "Jungle Toad", // ZG

	// V+
	25254: "Cockroach",

	// WoW Forever
	263055: "Crab",
	263061: "Toad",
	263064: "Snake",
}

// Name returns the canonical label for a known critter entry. This lookup is
// independent of observed names, fight activity and ranking eligibility.
func Name(entry uint32) (string, bool) {
	name, known := names[entry]
	return name, known
}
