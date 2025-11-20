package main

import (
	"bytes"
	"fmt"
	"go/format"
	"os"
	"text/template"
)

// Template variables
var templateVars = map[string]string{
	"Unit":       `(.+[^\s])`,
	"Number":     `(\d+)`,
	"School":     `([a-zA-Z]+)`,
	"TargetType": `(cr|h)`,
	"Action":     `(casts|performs)`,
	"Effect":     `(blocks|parries|evades|dodges|deflects)`,
	"Resource":   `(Health|health|Mana|Rage|Energy|Happiness|happiness|Focus)`,
	"GainLose":   `(gains|loses)`,
	"Absorb":     `(absorbs|resists)`,
	"Miss":       `(s|d)`,
	"Resist":     `(blocked|parried|evaded|dodged|resisted|deflected)`,
	"AuraType":   `(is afflicted by|gains)`,
	"DeathType":  `(dies|is destroyed)`,
	"Any":        `(.*)`,
	"OptAny":     `\s?(.*)`,
}

// RegexPattern represents a single regex pattern with metadata
type RegexPattern struct {
	VarName  string
	Template string
	Comment  string
}

// PatternGroup represents a group of related patterns
type PatternGroup struct {
	Comment  string
	Patterns []RegexPattern
}

// Define all regex patterns using template variables
var patternGroups = []PatternGroup{
	{
		Comment: "From LegacyPlayer",
		Patterns: []RegexPattern{
			{
				VarName:  "ReDamageHitOrCrit",
				Template: `{{.Unit}} {{.TargetType}}its {{.Unit}} for {{.Number}}\.{{.OptAny}}`,
			},
			{
				VarName:  "ReDamageHitOrCritSchool",
				Template: `{{.Unit}} {{.TargetType}}its {{.Unit}} for {{.Number}} {{.School}} damage\.{{.OptAny}}`,
			},
			{
				VarName:  "ReDamageMiss",
				Template: `{{.Unit}} misses {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageBlockParryEvadeDodgeDeflect",
				Template: `{{.Unit}} attacks\. {{.Unit}} {{.Effect}}\.`,
			},
			{
				VarName:  "ReDamageAbsorbResist",
				Template: `{{.Unit}} attacks\. {{.Unit}} {{.Absorb}} all the damage\.`,
			},
			{
				VarName:  "ReDamageImmune",
				Template: `{{.Unit}} attacks but {{.Unit}} is immune\.`,
			},
			{
				VarName:  "ReDamageSpellHitOrCrit",
				Template: `{{.Unit}}\s's {{.Unit}} {{.TargetType}}its {{.Unit}} for {{.Number}}\.{{.OptAny}}`,
			},
			{
				VarName:  "ReDamageSpellHitOrCritSchool",
				Template: `{{.Unit}}\s's {{.Unit}} {{.TargetType}}its {{.Unit}} for {{.Number}} {{.School}} damage\.{{.OptAny}}`,
			},
			{
				VarName:  "ReDamagePeriodic",
				Template: `{{.Unit}} suffers {{.Number}} {{.School}} damage from {{.Unit}}\s's {{.Unit}}\.{{.OptAny}}`,
			},
			{
				VarName:  "ReDamageSpellSplit",
				Template: `{{.Unit}}\s's {{.Unit}} causes {{.Unit}} {{.Number}} damage\.{{.OptAny}}`,
			},
			{
				VarName:  "ReDamageSpellMiss",
				Template: `{{.Unit}}\s's {{.Unit}} misse{{.Miss}} {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageSpellBlockParryEvadeDodgeResistDeflect",
				Template: `{{.Unit}}\s's {{.Unit}} was {{.Resist}} by {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageSpellAbsorb",
				Template: `{{.Unit}}\s's {{.Unit}} is absorbed by {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageSpellAbsorbSelf",
				Template: `{{.Unit}} absorbs {{.Unit}}\s's {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageReflect",
				Template: `{{.Unit}}\s's {{.Unit}} is reflected back by {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageProcResist",
				Template: `{{.Unit}} resists {{.Unit}}\s's {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageSpellImmune",
				Template: `{{.Unit}}\s's {{.Unit}} fails\. {{.Unit}} is immune\.`,
			},
			{
				VarName:  "ReSpellCastAttempt",
				Template: `{{.Unit}} begins to {{.Action}} {{.Unit}}\.`,
			},
			{
				VarName:  "ReDamageShield",
				Template: `{{.Unit}} reflects {{.Number}} {{.School}} damage to {{.Unit}}\.`,
			},
			{
				VarName:  "ReHealHit",
				Template: `{{.Unit}}\s's {{.Unit}} heals {{.Unit}} for {{.Number}}\.`,
			},
			{
				VarName:  "ReHealCrit",
				Template: `{{.Unit}}\s's {{.Unit}} critically heals {{.Unit}} for {{.Number}}\.`,
			},
			{
				VarName:  "ReGain",
				Template: `{{.Unit}} {{.GainLose}} {{.Number}} {{.Resource}} from {{.Unit}}\s's {{.Unit}}\.`,
			},
			{
				VarName:  "ReAuraGainHarmfulHelpful",
				Template: `{{.Unit}} {{.AuraType}} {{.Unit}} \({{.Number}}\)\.`,
			},
			{
				VarName:  "ReAuraFade",
				Template: `{{.Unit}} fades from {{.Unit}}\.`,
			},
			{
				VarName:  "ReAuraDispel",
				Template: `{{.Unit}}\s's {{.Unit}} is removed\.`,
			},
			{
				VarName:  "ReAuraInterrupt",
				Template: `{{.Unit}} interrupts {{.Unit}}\s's {{.Unit}}\.`,
			},
			{
				VarName:  "ReSpellCastPerformDurability",
				Template: `{{.Unit}} {{.Action}} {{.Unit}} on {{.Unit}}: {{.Any}}\.`,
			},
			{
				VarName:  "ReSpellCastPerform",
				Template: `{{.Unit}} {{.Action}} {{.Unit}} on {{.Unit}}\.`,
			},
			{
				VarName:  "ReSpellCastPerformUnknown",
				Template: `{{.Unit}} {{.Action}} {{.Unit}}\.`,
			},
			{
				VarName:  "ReUnitDieDestroyed",
				Template: `{{.Unit}} {{.DeathType}}\.`,
			},
			{
				VarName:  "ReUnitSlay",
				Template: `{{.Unit}} is slain by {{.Unit}}(!|\.)`,
			},
			{
				VarName:  "ReZoneInfo",
				Template: `ZONE_INFO: ([^&]+)&{{.Unit}}\&{{.Number}}`,
			},
			{
				VarName:  "ReLoot",
				Template: `LOOT: ([^&]+)&{{.Unit}} receives loot: \|c{{.School}}\|Hitem:{{.Number}}:{{.Number}}:{{.Number}}:{{.Number}}\|h\[([a-zA-Z0-9\s']+)\]\|h\|rx{{.Number}}\.`,
			},
			{
				VarName:  "ReBugDamageSpellHitOrCrit",
				Template: `{{.Unit}}\s's {{.TargetType}}its {{.Unit}} for {{.Number}}\.{{.OptAny}}`,
				Comment:  "Bug pattern",
			},
		},
	},
	{
		Comment: "From myself",
		Patterns: []RegexPattern{
			{
				VarName:  "ReCreates",
				Template: `{{.Unit}} (creates) {{.Unit}}\.`,
			},
			{
				VarName:  "ReGainsAttack",
				Template: `{{.Unit}} gains {{.Number}} extra attack through {{.Unit}}\.`,
			},
			{
				VarName:  "ReFallDamage",
				Template: `{{.Unit}} falls and loses {{.Number}} health\.`,
			},
			{
				VarName:  "ReGainNoSource",
				Template: `{{.Unit}} {{.GainLose}} {{.Number}} {{.Resource}}\.`,
			},
		},
	},
}

const outputTemplate = `package main

import "regexp"

{{ range .Groups }}
// {{ .Comment }}
var (
{{ range .Patterns }}{{ if .Comment }}	// {{ .Comment }}
{{ end }}	{{ .VarName }} = regexp.MustCompile(` + "`" + `{{ .CompiledPattern }}` + "`" + `)
{{ end }}
)
{{ end }}
`

func main() {
	// Process each pattern and expand templates
	type CompiledPattern struct {
		VarName         string
		CompiledPattern string
		Comment         string
	}

	type CompiledGroup struct {
		Comment  string
		Patterns []CompiledPattern
	}

	var compiledGroups []CompiledGroup

	for _, group := range patternGroups {
		compiledGroup := CompiledGroup{
			Comment:  group.Comment,
			Patterns: make([]CompiledPattern, 0, len(group.Patterns)),
		}

		for _, pattern := range group.Patterns {
			// Parse and execute the template
			tmpl, err := template.New("regex").Parse(pattern.Template)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error parsing template for %s: %v\n", pattern.VarName, err)
				os.Exit(1)
			}

			var buf bytes.Buffer
			if err := tmpl.Execute(&buf, templateVars); err != nil {
				fmt.Fprintf(os.Stderr, "Error executing template for %s: %v\n", pattern.VarName, err)
				os.Exit(1)
			}

			compiledGroup.Patterns = append(compiledGroup.Patterns, CompiledPattern{
				VarName:         pattern.VarName,
				CompiledPattern: buf.String(),
				Comment:         pattern.Comment,
			})
		}

		compiledGroups = append(compiledGroups, compiledGroup)
	}

	// Generate the output file
	tmpl, err := template.New("output").Parse(outputTemplate)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing output template: %v\n", err)
		os.Exit(1)
	}

	var output bytes.Buffer
	if err := tmpl.Execute(&output, map[string]interface{}{
		"Groups": compiledGroups,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "Error executing output template: %v\n", err)
		os.Exit(1)
	}

	// Format the generated code
	formatted, err := format.Source(output.Bytes())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error formatting generated code: %v\n", err)
		fmt.Fprintf(os.Stderr, "Generated code:\n%s\n", output.String())
		os.Exit(1)
	}

	// Write to source.go
	if err := os.WriteFile("source.go", formatted, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing source.go: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✓ Generated source.go successfully!")
	
	// Show template variables for reference
	fmt.Println("\nAvailable template variables:")
	var keys []string
	for k := range templateVars {
		keys = append(keys, k)
	}
	// Sort for consistent output
	for _, k := range []string{"Unit", "Number", "School", "TargetType", "Action", "Effect", "Resource", "GainLose", "Absorb", "Miss", "Resist", "AuraType", "DeathType", "Any", "OptAny"} {
		if val, ok := templateVars[k]; ok {
			fmt.Printf("  {{.%-12s}} → %s\n", k+"}}", val)
		}
	}
}
