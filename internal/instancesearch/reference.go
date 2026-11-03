package instancesearch

import (
	"fmt"
	"strings"
)

// FieldReference renders the field registry as Markdown. It is checked in at
// .agents/skills/instance-search/fields.md and kept in sync by a test.
func FieldReference() string {
	var b strings.Builder
	b.WriteString("<!-- Generated from internal/instancesearch/fields.go by TestFieldReference. Do not edit. -->\n")
	b.WriteString("# Instance search fields\n")
	for _, k := range []scopeKind{scopeInstance, scopeEncounter, scopePlayer} {
		switch k {
		case scopeInstance:
			b.WriteString("\n## Instance fields\n\nUse at the top level (outside any quantifier).\n\n")
		case scopeEncounter:
			b.WriteString("\n## Encounter fields\n\nUse inside `any_encounter` / `count_encounters`. One encounter is one pull.\n\n")
		case scopePlayer:
			b.WriteString("\n## Player fields\n\nUse inside `any_player` / `count_players`. All fields in one quantifier refer to the same player.\n\n")
		}
		b.WriteString("| Field | Type | Ops | Options | Description |\n|---|---|---|---|---|\n")
		for _, f := range fields {
			if f.Scope != k {
				continue
			}
			typ := string(f.Type)
			if f.Unit != "" {
				typ += " (" + f.Unit + ")"
			}
			if f.Type == typeEnum {
				typ += ": " + strings.Join(f.Enum, ", ")
			}
			var opts []string
			if f.Bosses {
				opts = append(opts, "bosses, match")
			}
			if f.ParseScope {
				opts = append(opts, "parse_scope")
			}
			if f.Metric {
				opts = append(opts, "metric")
			}
			if f.On {
				opts = append(opts, "on")
			}
			fmt.Fprintf(&b, "| `%s` | %s | %s | %s | %s |\n",
				f.Name, typ, joinOps(f.Type.ops()), strings.Join(opts, ", "), f.Doc)
		}
	}
	return b.String()
}
