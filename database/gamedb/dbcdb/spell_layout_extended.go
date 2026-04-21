package dbcdb

import (
	"github.com/Gophercraft/core/format/dbc/dbd"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/Gophercraft/core/vsn"
)

// ExtendedSpellBuild is a pseudo-build number used for servers whose Spell.dbc
// has a non-standard layout compared to stock 3.3.5a (12340):
//   - 6 extra columns after EffectDieSides: EffectBaseDice[3] + EffectDicePerLevel[3]
//   - Difficulty column removed from the end
//   - Total: 239 fields, 956 bytes per record (vs 234/936 stock)
//
// Servers using this layout: Warmane, Ascension.
// The standard 3.3.5a layout is not affected (Epoch uses the stock layout).
const ExtendedSpellBuild vsn.Build = 12341

// registerExtendedSpellLayout sets SpellBuildOverride and registers a patched
// Spell definition layout under ExtendedSpellBuild. Call from init() in
// server-specific build-tagged files.
func registerExtendedSpellLayout() {
	SpellBuildOverride = ExtendedSpellBuild

	def, err := dbdefs.Lookup("Spell")
	if err != nil {
		panic("dbcdb: extended spell layout: " + err.Error())
	}

	// Find the stock 3.3.5a layout (may be matched via VerifiedBuilds or BuildRanges).
	var stockLayout *dbd.Layout
	for i := range def.Layouts {
		l := &def.Layouts[i]
		for _, exact := range l.VerifiedBuilds {
			if exact == vsn.V3_3_5a {
				stockLayout = l
			}
		}
		for _, rng := range l.BuildRanges {
			if rng.Contains(vsn.V3_3_5a) {
				stockLayout = l
			}
		}
		if stockLayout != nil {
			break
		}
	}
	if stockLayout == nil {
		panic("dbcdb: extended spell layout: no 3.3.5a Spell layout found")
	}

	// Clone the layout columns and patch them.
	cols := make([]dbd.LayoutColumn, 0, len(stockLayout.Columns)+2)
	for _, col := range stockLayout.Columns {
		cols = append(cols, col)

		// Insert EffectBaseDice[3] and EffectDicePerLevel[3] right after EffectDieSides.
		if col.Name == "EffectDieSides" {
			cols = append(cols, dbd.LayoutColumn{
				Name:      "EffectBaseDice",
				Bits:      32,
				Signed:    true,
				ArraySize: 3,
			})
			cols = append(cols, dbd.LayoutColumn{
				Name:      "EffectDicePerLevel",
				Bits:      32,
				Signed:    true,
				ArraySize: 3,
			})
		}
	}

	// Remove Difficulty (last column in stock layout).
	filtered := cols[:0]
	for _, col := range cols {
		if col.Name != "Difficulty" {
			filtered = append(filtered, col)
		}
	}

	extLayout := dbd.Layout{
		VerifiedBuilds: []vsn.Build{ExtendedSpellBuild},
		Columns:        filtered,
	}

	def.Layouts = append(def.Layouts, extLayout)
	dbdefs.Register(def)
}
