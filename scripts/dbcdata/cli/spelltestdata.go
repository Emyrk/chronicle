package cli

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"text/template"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

// testSpellIDs is the list of spell IDs to generate test vectors for.
//
// Adding a new regression test:
//
//  1. Add the spell ID to this list.
//  2. Run: make gen
//  3. Run: cd frontend/chronicle && npx vitest run src/api/wowdb.test.ts
//     → The new spell will FAIL with a message showing the raw template,
//     the resolved description, and cross-spell references.
//  4. Verify the resolved text is correct. If it's wrong, fix the resolver
//     in frontend/chronicle/src/api/wowdb.ts first.
//  5. Copy the expected string into the expectedDescriptions map in
//     frontend/chronicle/src/api/wowdb.test.ts (the failure message
//     gives you the exact line to paste).
//  6. Run tests again — should pass.
var testSpellIDs = []int{
	133,   // Fireball rank 1 — basic $s1, $d
	139,   // Renew rank 1 — $o1 periodic total
	15237, // Holy Fire Nova — $s1, $a1 radius
	18941, // Windfury — $l pluralization
	17347, // Hemorrhage — $l pluralization, $n
	52551, // Drain Life variant — $*N;s1 arithmetic
	16511, // Hemorrhage -- point:points;.
	25175, // Triple attack -- attack:attacks;.
	709,   // Drain life -- $*5;s1
	52550, // Dark Harvest
	11712, // Curse of Agony
	46269, // Fire Breath — ${expr} inline arithmetic
}

// crossSpellRef matches patterns like $3137s1 (spell 3137, variable s1).
var crossSpellRef = regexp.MustCompile(`\$(\d+)([a-zA-Z])(\d)?`)

// extractReferencedSpellIDs returns all spell IDs referenced via $NNNNsX
// patterns in the given description template.
func extractReferencedSpellIDs(description string) []int {
	matches := crossSpellRef.FindAllStringSubmatch(description, -1)
	seen := make(map[int]bool)
	var ids []int
	for _, m := range matches {
		id, err := strconv.Atoi(m[1])
		if err != nil {
			continue
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return ids
}

type spellTestEntry struct {
	ID       int
	Name     string
	JSON     string
	IsTarget bool // true if this is a test subject, false if only a cross-reference
}

type spellTestTarget struct {
	ID             int
	Name           string
	DescTemplate   string // raw template with $s1, $d, etc.
	AuraTemplate   string // raw aura description template
	CrossSpellRefs []int  // spell IDs referenced via $NNNNsX in descriptions
}

type spellTestData struct {
	TestSpellIDs []int
	Targets      []spellTestTarget
	Entries      []spellTestEntry
}

// spellResponse mirrors servicewowdb.SpellResponse so we get the same JSON shape.
type spellResponse struct {
	*chrondbc.Spell
	DamageType chrondbc.SpellDamageType `json:"damage_type"`
}

func SpellTestDataCmd() *serpent.Command {
	var tsDir string
	var dbcPath string

	return &serpent.Command{
		Use:   "spell-test-data",
		Short: "Generate TypeScript spell test vectors from DBC data.",
		Options: serpent.OptionSet{
			{
				Name:        "ts-dir",
				Description: "Output directory for generated TypeScript file.",
				Flag:        "ts-dir",
				Value:       serpent.StringOf(&tsDir),
			},
			{
				Name:        "dbc",
				Description: "Path to WoW client directory.",
				Flag:        "dbc",
				Value:       serpent.StringOf(&dbcPath),
				Default:     "/home/steven/Games/turtlewow/drive_c/Program Files (x86)/TurtleWoW",
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			if tsDir == "" {
				return fmt.Errorf("--ts-dir is required")
			}

			wc, err := dbcdb.New(dbcPath)
			if err != nil {
				return fmt.Errorf("open wow client: %w", err)
			}

			data, err := collectSpellTestData(wc)
			if err != nil {
				return fmt.Errorf("collect spell test data: %w", err)
			}

			return writeTemplate(
				filepath.Join(tsDir, "spellTestVectors.generated.ts"),
				spellTestDataTSTemplate,
				data,
			)
		},
	}
}

func collectSpellTestData(wc *dbcdb.WoWClient) (*spellTestData, error) {
	spellsDBC, err := wc.Spells()
	if err != nil {
		return nil, fmt.Errorf("read spells: %w", err)
	}

	spells := chrondbc.NewSpells(spellsDBC.Underlying())

	// Collect all spell IDs we need: test subjects + cross-references
	needed := make(map[int]bool)
	for _, id := range testSpellIDs {
		needed[id] = true
	}

	// First pass: load test subjects and discover cross-references
	loaded := make(map[int]*chrondbc.Spell)
	var targets []spellTestTarget
	for _, id := range testSpellIDs {
		spell, err := spells.ID(id)
		if err != nil {
			return nil, fmt.Errorf("spell %d not found: %w", id, err)
		}
		loaded[id] = spell

		// Collect cross-spell references from both descriptions
		descRefs := extractReferencedSpellIDs(spell.Description())
		auraRefs := extractReferencedSpellIDs(spell.AuraDescription())
		allRefs := append(descRefs, auraRefs...)

		// Deduplicate refs
		seen := make(map[int]bool)
		var uniqueRefs []int
		for _, refID := range allRefs {
			if !seen[refID] {
				seen[refID] = true
				uniqueRefs = append(uniqueRefs, refID)
				needed[refID] = true
			}
		}

		targets = append(targets, spellTestTarget{
			ID:             id,
			Name:           spell.Name(),
			DescTemplate:   spell.Description(),
			AuraTemplate:   spell.AuraDescription(),
			CrossSpellRefs: uniqueRefs,
		})
	}

	// Second pass: load any cross-referenced spells we haven't loaded yet
	for id := range needed {
		if _, ok := loaded[id]; ok {
			continue
		}
		spell, err := spells.ID(id)
		if err != nil {
			fmt.Printf("warning: cross-referenced spell %d not found, skipping\n", id)
			continue
		}
		loaded[id] = spell
	}

	// Build entries with JSON
	var entries []spellTestEntry
	isTarget := make(map[int]bool)
	for _, id := range testSpellIDs {
		isTarget[id] = true
	}

	for id, spell := range loaded {
		resp := spellResponse{
			Spell:      spell,
			DamageType: spell.SpellDamageType(),
		}
		jsonBytes, err := json.Marshal(resp)
		if err != nil {
			return nil, fmt.Errorf("marshal spell %d: %w", id, err)
		}
		entries = append(entries, spellTestEntry{
			ID:       id,
			Name:     spell.Name(),
			JSON:     string(jsonBytes),
			IsTarget: isTarget[id],
		})
	}

	return &spellTestData{
		TestSpellIDs: testSpellIDs,
		Targets:      targets,
		Entries:      entries,
	}, nil
}

var spellTestDataTSTemplate = template.Must(template.New("spell-test-data-ts").Funcs(template.FuncMap{
	"jsarray": func(ids []int) string {
		if len(ids) == 0 {
			return "[]"
		}
		s := "["
		for i, id := range ids {
			if i > 0 {
				s += ", "
			}
			s += strconv.Itoa(id)
		}
		s += "]"
		return s
	},
}).Parse(`// Code generated by scripts/dbcdata. DO NOT EDIT.
//
// To add new test spells, edit testSpellIDs in scripts/dbcdata/cli/spelltestdata.go
// and run: make gen
//
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — generated JSON may not perfectly satisfy strict TS checks
import type { WoWSpell } from "../wowdb";

// Test subject spells — these are the spells whose descriptions we verify.
// Each entry shows the raw description template (with $variables) and any
// cross-spell references needed for resolution.
export const testSpells = [
{{- range .Targets}}
  {
    id: {{.ID}},
    name: {{printf "%q" .Name}},
    descriptionTemplate: {{printf "%q" .DescTemplate}},
    auraDescriptionTemplate: {{printf "%q" .AuraTemplate}},
    crossSpellRefs: {{jsarray .CrossSpellRefs}},
  },
{{- end}}
];

// All spell data: test subjects + any spells they reference via $NNNNsX patterns.
export const spells: Record<number, WoWSpell> = {
{{- range .Entries}}
  // {{.Name}} ({{.ID}})
  {{.ID}}: {{.JSON}} as unknown as WoWSpell,
{{- end}}
};
`))
