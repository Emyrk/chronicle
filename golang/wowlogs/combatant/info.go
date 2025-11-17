package combatant

import "strings"

type combatantInfo []string

func splitInfo(content string) combatantInfo {
	return strings.Split(strings.TrimPrefix(content, "COMBATANT_INFO: "), "&")
}

func (i combatantInfo) timestamp() string {
	return i.getArg(0)
}

func (i combatantInfo) name() string {
	return i.getArg(1)
}

func (i combatantInfo) heroClassLocal() string {
	return i.getArg(2)
}

func (i combatantInfo) raceLocal() string {
	return i.getArg(3)
}

func (i combatantInfo) genderLocal() string {
	return i.getArg(4)
}

func (i combatantInfo) petName() string {
	return i.getArg(5)
}

func (i combatantInfo) guildName() string {
	return i.getArg(6)
}

func (i combatantInfo) guildRankName() string {
	return i.getArg(7)
}

func (i combatantInfo) guildRankIndex() string {
	return i.getArg(8)
}

func (i combatantInfo) gear() ([]string, bool) {
	hasGear := false
	slots := make([]string, 0, 19)
	for c := 9; c < 28; c++ {
		arg := i.getArg(c)
		hasGear = hasGear || arg != "nil"
		slots = append(slots, arg)
	}
	return slots, hasGear
}

func (i combatantInfo) getArg(index int) string {
	// Protect against out-of-bounds access
	if index < 0 || index >= len(i) {
		return ""
	}
	return i[index]
}
