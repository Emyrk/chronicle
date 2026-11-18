package chroniclesdk

import (
	"fmt"
	"slices"
	"strings"
	"unicode"
)

// GeneratePossibleHostilesGoCode exports an editable scaffold for the instances
// package, never an inference that an unknown or ordinary unit is hostile.
// Legacy ZonedUnits lacks categories, so is deliberately not used.
func (r *IdentityReport) GeneratePossibleHostilesGoCode() string {
	if r == nil {
		return ""
	}
	zones := make(map[string]map[uint32]IdentityUnit)
	for _, instance := range r.Instances {
		for _, unit := range instance.Units {
			if (unit.Category != "unknown" && unit.Category != "ordinary") || unit.EntryID == 0 || unit.EntryID > 0xFFFFFF {
				continue
			}
			if zones[instance.Zone] == nil {
				zones[instance.Zone] = make(map[uint32]IdentityUnit)
			}
			previous, exists := zones[instance.Zone][unit.EntryID]
			// Resolve duplicate names deterministically, preferring a non-empty name.
			if exists {
				unit.Boss = unit.Boss || previous.Boss
				if previous.Name != "" && (unit.Name == "" || previous.Name < unit.Name) {
					unit.Name = previous.Name
				}
			}
			zones[instance.Zone][unit.EntryID] = unit
		}
	}
	if len(zones) == 0 {
		return ""
	}
	names := make([]string, 0, len(zones))
	for zone := range zones {
		names = append(names, zone)
	}
	slices.Sort(names)
	var b strings.Builder
	b.WriteString("// POSSIBLE HOSTILES ONLY: unknown category does not prove hostility.\n// Review affiliation and boss roles before using LoadAdds/LoadBosses.\n// Remove friendly/neutral entries as appropriate; review encounter hooks separately.\n// Scaffold for package instances. Register the reviewed factory in the appropriate registry.\n\n")
	used := make(map[string]bool)
	for _, zone := range names {
		base := zoneGoIdentifier(zone)
		ident := base
		for suffix := 2; used[ident]; suffix++ {
			ident = fmt.Sprintf("%s%d", base, suffix)
		}
		used[ident] = true
		entries := make([]uint32, 0, len(zones[zone]))
		for entry := range zones[zone] {
			entries = append(entries, entry)
		}
		slices.Sort(entries)
		fmt.Fprintf(&b, "func %sHostiles() map[uint32]Identity {\n\thostile := make(map[uint32]Identity)\n", ident)
		for _, boss := range []bool{false, true} {
			loader := "LoadAdds"
			if boss {
				loader = "LoadBosses"
			}
			fmt.Fprintf(&b, "\t%s(hostile, map[uint32]string{\n", loader)
			for _, entry := range entries {
				unit := zones[zone][entry]
				if unit.Boss != boss {
					continue
				}
				name := unit.Name
				if name == "" {
					name = fmt.Sprintf("Entry %d", entry)
				}
				fmt.Fprintf(&b, "\t\t%d: %q,\n", entry, name)
			}
			b.WriteString("\t})\n")
		}
		b.WriteString("\t// TODO: verify boss roles, affiliation, encounter names and hooks.\n\treturn hostile\n}\n\n")
		fmt.Fprintf(&b, "var %sFactory = &CommonFactory{\n\tName: %q,\n\tZoneNames: []string{%q},\n\tHostiles: FromMap(%sHostiles()),\n}\n\n", ident, zone, strings.ToLower(zone), ident)
	}
	return b.String()
}

func zoneGoIdentifier(zone string) string {
	var b strings.Builder
	upper := true
	for _, r := range zone {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			upper = true
			continue
		}
		if b.Len() == 0 && unicode.IsDigit(r) {
			b.WriteString("Zone")
		}
		if upper {
			r = unicode.ToUpper(r)
		} else {
			r = unicode.ToLower(r)
		}
		b.WriteRune(r)
		upper = false
	}
	if b.Len() == 0 {
		return "UnknownZone"
	}
	return b.String()
}
