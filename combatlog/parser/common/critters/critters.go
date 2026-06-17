package critters

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

var critters = map[uint32]string{
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
}

func IsCritter(id guid.GUID) bool {
	if !id.IsCreature() {
		return false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return false
	}

	_, exists := critters[entry]
	return exists
}
