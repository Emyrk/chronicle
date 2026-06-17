package warlockdemon

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

var demons = map[uint32]string{
	11859: "Doomguard",
	17252: "Felguard",
	89:    "Infernal",
}

func IsWarlockDemon(id guid.GUID) (string, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return "", false
	}

	return IsWarlockDemonEntry(entry)
}

func IsWarlockDemonEntry(entry uint32) (string, bool) {
  name, ok := demons[entry]
  return name, ok
}