package chrondbc

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/vsn"
	"github.com/stretchr/testify/require"
)

var updateSpellGoldens = flag.Bool("update", false, "regenerate spell parity golden values")

type spellGoldenDataset struct {
	name  string
	build vsn.Build
}

type spellGoldenEvaluator func(*Spell) any

var spellGoldenEvaluators = map[string]spellGoldenEvaluator{
	"id":                          func(s *Spell) any { return s.ID },
	"name":                        func(s *Spell) any { return s.Name() },
	"subtext":                     func(s *Spell) any { return s.Subtext() },
	"school":                      func(s *Spell) any { return s.School },
	"power.type":                  func(s *Spell) any { return s.PowerType },
	"power.mana_cost":             func(s *Spell) any { return s.ManaCost },
	"power.mana_cost_pct":         func(s *Spell) any { return s.ManaCostPct },
	"power.mana_cost_per_level":   func(s *Spell) any { return s.ManaCostPerLevel },
	"power.mana_per_second":       func(s *Spell) any { return s.ManaPerSecond },
	"powers.count":                func(s *Spell) any { return len(s.Powers) },
	"default_power.type":          defaultPowerValue(func(p *SpellPower) any { return p.PowerType }),
	"default_power.mana_cost":     defaultPowerValue(func(p *SpellPower) any { return p.ManaCost }),
	"default_power.mana_cost_pct": defaultPowerValue(func(p *SpellPower) any { return p.PowerCostPct }),
	"default_power.mana_cost_per_level": defaultPowerValue(func(p *SpellPower) any {
		return p.ManaCostPerLevel
	}),
	"default_power.mana_per_second": defaultPowerValue(func(p *SpellPower) any { return p.ManaPerSecond }),
	"effects.count":                 func(s *Spell) any { return len(s.Effects) },
	"spell_damage_type":             func(s *Spell) any { return s.SpellDamageType() },
	"attack_outcome":                func(s *Spell) any { return s.AttackOutcome() },
	"is_deprecated":                 func(s *Spell) any { return s.IsDeprecated() },
	"affects.school.physical":       affectsSchool(SchoolPhysical),
	"affects.school.holy":           affectsSchool(SchoolHoly),
	"affects.school.fire":           affectsSchool(SchoolFire),
	"affects.school.nature":         affectsSchool(SchoolNature),
	"affects.school.frost":          affectsSchool(SchoolFrost),
	"affects.school.shadow":         affectsSchool(SchoolShadow),
	"affects.school.arcane":         affectsSchool(SchoolArcane),
}

func init() {
	for index := int32(0); index < 3; index++ {
		prefix := fmt.Sprintf("effect.%d.", index)
		spellGoldenEvaluators[prefix+"index"] = effectValue(index, func(e *SpellEffect) any { return e.EffectIndex })
		spellGoldenEvaluators[prefix+"type"] = effectValue(index, func(e *SpellEffect) any { return e.Effect })
		spellGoldenEvaluators[prefix+"aura"] = effectValue(index, func(e *SpellEffect) any { return e.EffectAura })
		spellGoldenEvaluators[prefix+"base_points"] = effectValue(index, func(e *SpellEffect) any { return e.EffectBasePoints })
		spellGoldenEvaluators[prefix+"effective_base_points"] = effectValue(index, func(e *SpellEffect) any { return e.EffectiveBasePoints() })
		spellGoldenEvaluators[prefix+"misc"] = effectValue(index, func(e *SpellEffect) any { return e.EffectMiscValue })
		spellGoldenEvaluators[prefix+"targets"] = effectValue(index, func(e *SpellEffect) any { return e.ImplicitTarget })
	}
}

func defaultPowerValue(value func(*SpellPower) any) spellGoldenEvaluator {
	return func(spell *Spell) any {
		power := spell.DefaultPower()
		if power == nil {
			return nil
		}
		return value(power)
	}
}

func effectValue(index int32, value func(*SpellEffect) any) spellGoldenEvaluator {
	return func(spell *Spell) any {
		effect := spell.EffectByIndex(index)
		if effect == nil {
			return nil
		}
		return value(effect)
	}
}

func affectsSchool(school School) spellGoldenEvaluator {
	return func(spell *Spell) any {
		return spell.Affects(Spell{School: school})
	}
}

func TestLegacySpellGoldenParity(t *testing.T) {
	datasets := []spellGoldenDataset{
		{name: "turtle", build: vsn.V1_12_1},
		{name: "kronos", build: vsn.V1_12_1},
		{name: "tbc", build: vsn.V2_4_3},
		{name: "epoch", build: vsn.V3_3_5a},
	}

	for _, dataset := range datasets {
		t.Run(dataset.name, func(t *testing.T) {
			assertSpellGoldenParity(t, dataset)
		})
	}
}

type spellGoldenLine struct {
	raw      string
	spellID  SpellID
	field    string
	expected string
	data     bool
}

func assertSpellGoldenParity(t *testing.T, dataset spellGoldenDataset) {
	t.Helper()

	goldenPath := filepath.Join("testdata", "spell-goldens", dataset.name+".tsv")
	goldenData, err := os.ReadFile(goldenPath)
	require.NoError(t, err)
	lines := parseSpellGoldenLines(t, goldenPath, goldenData)

	dbcData, err := os.ReadFile(filepath.Join("..", "..", "..", "assets", dataset.name, "Spell.dbc"))
	require.NoError(t, err)
	table, err := dbc.NewDB(dataset.build).Open("Spell", bytes.NewReader(dbcData))
	require.NoError(t, err)
	spells := NewSpells(table)

	cache := make(map[SpellID]*Spell)
	for _, line := range lines {
		if !line.data {
			continue
		}
		if _, ok := cache[line.spellID]; ok {
			continue
		}
		spell, loadErr := spells.ID(int(line.spellID))
		require.NoErrorf(t, loadErr, "%s: load spell %d", goldenPath, line.spellID)
		cache[line.spellID] = spell
	}

	updated := make([]string, 0, len(lines))
	for lineNumber, line := range lines {
		if !line.data {
			updated = append(updated, line.raw)
			continue
		}
		evaluator, ok := spellGoldenEvaluators[line.field]
		require.Truef(t, ok, "%s:%d: unknown spell golden field %q; add it to spellGoldenEvaluators", goldenPath, lineNumber+1, line.field)
		actual := encodeSpellGoldenValue(t, evaluator(cache[line.spellID]))
		if *updateSpellGoldens {
			updated = append(updated, fmt.Sprintf("%d\t%s\t%s", line.spellID, line.field, actual))
			continue
		}
		require.Equalf(t, line.expected, actual, "%s:%d: spell %d field %s", goldenPath, lineNumber+1, line.spellID, line.field)
	}

	if !*updateSpellGoldens {
		return
	}
	updatedData := []byte(strings.Join(updated, "\n") + "\n")
	if bytes.Equal(goldenData, updatedData) {
		return
	}
	require.NoError(t, os.WriteFile(goldenPath, updatedData, 0o644))
}

func parseSpellGoldenLines(t *testing.T, path string, data []byte) []spellGoldenLine {
	t.Helper()

	rawLines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
	lines := make([]spellGoldenLine, 0, len(rawLines))
	for lineNumber, raw := range rawLines {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			lines = append(lines, spellGoldenLine{raw: raw})
			continue
		}
		columns := strings.SplitN(raw, "\t", 3)
		require.Lenf(t, columns, 3, "%s:%d: expected spell_id, field, value TSV tuple", path, lineNumber+1)
		id, err := strconv.ParseInt(columns[0], 10, 32)
		require.NoErrorf(t, err, "%s:%d: invalid spell ID %q", path, lineNumber+1, columns[0])
		require.NotEmptyf(t, columns[1], "%s:%d: field is empty", path, lineNumber+1)
		lines = append(lines, spellGoldenLine{
			raw:      raw,
			spellID:  SpellID(id),
			field:    columns[1],
			expected: columns[2],
			data:     true,
		})
	}
	return lines
}

func encodeSpellGoldenValue(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	require.NoError(t, err)
	return string(encoded)
}
