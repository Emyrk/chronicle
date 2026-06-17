package cli

import (
	"fmt"
	"sort"
	"text/template"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
)

type durationModifierEntry struct {
	ID            int32
	Name          string
	SpellClassSet int32
	ClassMask     uint64 // from EffectItemType, used as spell family flags
	Percent       int32  // for AddPctModifier (aura 108)
	Flat          int32  // for AddFlatModifier (aura 107), in ms
	Deprecated    bool
}

// durationModifierTemplateData holds both the flat entries and the
// bit-decomposed reverse lookup for template rendering.
type durationModifierTemplateData struct {
	Entries []durationModifierEntry
	// ByClassBit is grouped: SpellClassSet -> bit -> []SpellID
	ByClassBit []classBitGroup
}

type classBitGroup struct {
	ClassSet int32
	Bits     []bitGroup
}

type bitGroup struct {
	Bit      uint64
	SpellIDs []int32
}

func collectDurationModifiers(wc *dbcdb.WoWClient) (*durationModifierTemplateData, error) {
	spellsDBC, err := wc.Spells()
	if err != nil {
		return nil, fmt.Errorf("read spells: %w", err)
	}

	spells := chrondbc.NewSpells(spellsDBC.Underlying())
	var entries []durationModifierEntry

	err = spells.Range(func(spell *chrondbc.Spell) bool {
		if !spell.Attrs.Has(chrondbc.Attr_Passive) {
			return true
		}

		for i, effect := range spell.Effect {
			if effect != chrondbc.EffectApplyAura {
				continue
			}

			// EffectMiscValue == 1 means the modifier targets duration.
			if spell.EffectMiscValue[i] != 1 {
				continue
			}

			value := spell.EffectBasePoints[i] + 1
			var pct, flat int32

			switch spell.EffectAura[i] {
			case chrondbc.AuraEffectAddPctModifier:
				pct = value
			case chrondbc.AuraEffectAddFlatModifier:
				flat = value
			default:
				continue
			}

			// For modifier auras, EffectItemType holds the spell family
			// flags bitmask (not an actual item ID). Mask to 32 bits to
			// avoid sign-extension from negative ItemID values, then
			// widen to uint64 for SpellClassMask comparison.
			classMask := uint64(uint32(spell.EffectItemType[i]))
			if classMask == 0 {
				continue
			}

			entries = append(entries, durationModifierEntry{
				ID:            int32(spell.ID),
				Name:          spell.Name(),
				SpellClassSet: int32(spell.SpellClassSet),
				ClassMask:     classMask,
				Percent:       pct,
				Flat:          flat,
				Deprecated:    spell.IsDeprecated(),
			})
			break
		}
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate spells: %w", err)
	}

	// Build bit-decomposed reverse lookup.
	// Map: classSet -> bit -> []spellID
	type key struct {
		classSet int32
		bit      uint64
	}
	bitMap := make(map[key][]int32)
	for _, e := range entries {
		for b := uint64(0); b < 64; b++ {
			mask := uint64(1) << b
			if e.ClassMask&mask != 0 {
				k := key{e.SpellClassSet, mask}
				bitMap[k] = append(bitMap[k], e.ID)
			}
		}
	}

	// Group into sorted structure for deterministic output.
	classSetMap := make(map[int32]map[uint64][]int32)
	for k, ids := range bitMap {
		if classSetMap[k.classSet] == nil {
			classSetMap[k.classSet] = make(map[uint64][]int32)
		}
		classSetMap[k.classSet][k.bit] = ids
	}

	var classSets []int32
	for cs := range classSetMap {
		classSets = append(classSets, cs)
	}
	sort.Slice(classSets, func(i, j int) bool { return classSets[i] < classSets[j] })

	var byClassBit []classBitGroup
	for _, cs := range classSets {
		bitsMap := classSetMap[cs]
		var bits []uint64
		for b := range bitsMap {
			bits = append(bits, b)
		}
		sort.Slice(bits, func(i, j int) bool { return bits[i] < bits[j] })

		var groups []bitGroup
		for _, b := range bits {
			ids := bitsMap[b]
			sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
			groups = append(groups, bitGroup{Bit: b, SpellIDs: ids})
		}
		byClassBit = append(byClassBit, classBitGroup{ClassSet: cs, Bits: groups})
	}

	return &durationModifierTemplateData{
		Entries:    entries,
		ByClassBit: byClassBit,
	}, nil
}

// affectedSpellEntry represents a spell whose duration can be modified,
// along with all the modifier spells that can affect it.
type affectedSpellEntry struct {
	ID            int32
	Name          string
	SpellClassSet int32
	BaseDuration  int32 // MaxDuration from SpellDuration.dbc in ms, -1 = permanent
	MaxDuration   int64 // theoretical max with all best-rank modifiers, in ms
	Deprecated    bool
	Modifiers     []affectedModifier
}

type affectedModifier struct {
	ID         int32
	Name       string
	Percent    int32
	Flat       int32
	Deprecated bool
}

func collectAffectedSpells(wc *dbcdb.WoWClient, modifiers []durationModifierEntry) ([]affectedSpellEntry, error) {
	spellsDBC, err := wc.Spells()
	if err != nil {
		return nil, fmt.Errorf("read spells: %w", err)
	}

	// Build classSet -> classMask -> []modifier index for matching.
	type modKey struct {
		classSet int32
		bit      uint64
	}
	bitIndex := make(map[modKey][]int)
	for idx, m := range modifiers {
		for b := uint64(0); b < 64; b++ {
			mask := uint64(1) << b
			if m.ClassMask&mask != 0 {
				k := modKey{m.SpellClassSet, mask}
				bitIndex[k] = append(bitIndex[k], idx)
			}
		}
	}

	spells := chrondbc.NewSpells(spellsDBC.Underlying())
	var entries []affectedSpellEntry

	err = spells.Range(func(spell *chrondbc.Spell) bool {
		cs := int32(spell.SpellClassSet)
		mask := uint64(spell.SpellClassMask)
		if mask == 0 {
			return true
		}

		// Find all matching modifiers via bit decomposition.
		seen := make(map[int]bool)
		for b := uint64(0); b < 64; b++ {
			bit := uint64(1) << b
			if mask&bit == 0 {
				continue
			}
			for _, idx := range bitIndex[modKey{cs, bit}] {
				seen[idx] = true
			}
		}
		if len(seen) == 0 {
			return true
		}

		dur := spell.Duration

		var mods []affectedModifier
		for idx := range seen {
			m := modifiers[idx]
			mods = append(mods, affectedModifier{
				ID:         m.ID,
				Name:       m.Name,
				Percent:    m.Percent,
				Flat:       m.Flat,
				Deprecated: m.Deprecated,
			})
		}
		sort.Slice(mods, func(i, j int) bool { return mods[i].ID < mods[j].ID })

		maxDur := chrondbc.MaxAuraDuration(spell, &chrondbc.DurationModifierSet{
			ByID:       dbcmem.DurationModifiers,
			ByClassBit: dbcmem.DurationModifiersByClassBit,
		})

		entries = append(entries, affectedSpellEntry{
			ID:            int32(spell.ID),
			Name:          spell.Name(),
			SpellClassSet: int32(spell.SpellClassSet),
			BaseDuration:  dur.MaxDuration,
			MaxDuration:   maxDur.Milliseconds(),
			Deprecated:    spell.IsDeprecated(),
			Modifiers:     mods,
		})
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate spells: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].ID < entries[j].ID })
	return entries, nil
}

var durationModifiersGoTemplate = template.Must(template.New("durationmodifiers-go").Funcs(template.FuncMap{
	"hex": func(v uint64) string {
		return fmt.Sprintf("0x%x", v)
	},
}).Parse(`// Code generated by scripts/dbcdata. DO NOT EDIT.

package {{.Server}}

import "github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"

func init() {
	dbcmem.DurationModifiers = map[int32]dbcmem.DurationModifier{
{{- range .Entries.Entries}}
		{{.ID}}: {SpellID: {{.ID}}, Name: {{printf "%q" .Name}}, Percent: {{.Percent}}, Flat: {{.Flat}}, Deprecated: {{.Deprecated}}},
{{- end}}
	}

	dbcmem.DurationModifiersByClassBit = map[int32]map[uint64][]int32{
{{- range .Entries.ByClassBit}}
		{{.ClassSet}}: {
		{{- range .Bits}}
			{{hex .Bit}}: { {{- range $i, $id := .SpellIDs}}{{if $i}}, {{end}}{{$id}}{{end -}} },
		{{- end}}
		},
{{- end}}
	}
}
`))

var durationModifiersTSTemplate = template.Must(template.New("durationmodifiers-ts").Parse(`// Code generated by scripts/dbcdata. DO NOT EDIT.

export type DurationModifierRef = {
  spellId: number;
  name: string;
  percent: number;
  flat: number;
  deprecated: boolean;
};

export type AffectedSpell = {
  name: string;
  spellClassSet: number;
  baseDurationMs: number;
  maxDurationMs: number;
  deprecated: boolean;
  modifiers: DurationModifierRef[];
};

// AffectedSpells maps spell IDs to their base duration and
// all passive talents that can modify their duration.
export const AffectedSpells: Record<number, AffectedSpell> = {
{{- range .}}
  {{.ID}}: {
    name: {{printf "%q" .Name}},
    spellClassSet: {{.SpellClassSet}},
    baseDurationMs: {{.BaseDuration}},
    maxDurationMs: {{.MaxDuration}},
    deprecated: {{.Deprecated}},
    modifiers: [
    {{- range .Modifiers}}
      { spellId: {{.ID}}, name: {{printf "%q" .Name}}, percent: {{.Percent}}, flat: {{.Flat}}, deprecated: {{.Deprecated}} },
    {{- end}}
    ],
  },
{{- end}}
};
`))

