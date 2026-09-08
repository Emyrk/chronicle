package v9

import (
	"bufio"
	"bytes"
	"sort"
	"strings"
)

// DominantEngagedRealm returns the realm shared by the largest number of unique
// players who appear in combat records while an encounter is active.
func DominantEngagedRealm(data []byte) string {
	engaged := make(map[string]string)
	fallback := make(map[string]string)
	inEncounter := false
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Text()
		idx := strings.Index(line, "  ")
		if idx < 0 {
			continue
		}
		fields := splitTopLevel(line[idx+2:])
		if len(fields) == 0 {
			continue
		}
		switch fields[0] {
		case "ENCOUNTER_START":
			inEncounter = true
			continue
		case "ENCOUNTER_END":
			inEncounter = false
			continue
		case "COMBAT_LOG_VERSION", "ZONE_CHANGE", "MAP_CHANGE", "COMBATANT_INFO", "EMOTE":
			continue
		}
		if len(fields) < 9 {
			continue
		}
		recordPlayerRealm(fallback, fields[1], fields[2])
		recordPlayerRealm(fallback, fields[5], fields[6])
		if inEncounter {
			recordPlayerRealm(engaged, fields[1], fields[2])
			recordPlayerRealm(engaged, fields[5], fields[6])
		}
	}
	if len(engaged) == 0 {
		engaged = fallback
	}
	counts := make(map[string]int)
	for _, realm := range engaged {
		counts[realm]++
	}
	type candidate struct {
		name  string
		count int
	}
	candidates := make([]candidate, 0, len(counts))
	for name, count := range counts {
		candidates = append(candidates, candidate{name: name, count: count})
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].count != candidates[j].count {
			return candidates[i].count > candidates[j].count
		}
		return candidates[i].name < candidates[j].name
	})
	if len(candidates) == 0 {
		return ""
	}
	return candidates[0].name
}

func recordPlayerRealm(players map[string]string, rawGUID, quotedName string) {
	if !strings.HasPrefix(rawGUID, "Player-") {
		return
	}
	name := strings.Trim(quotedName, "\"")
	parts := strings.Split(name, "-")
	if len(parts) < 3 {
		return
	}
	players[rawGUID] = strings.Join(parts[len(parts)-2:], "-")
}
