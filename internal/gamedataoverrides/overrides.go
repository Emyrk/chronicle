// Package gamedataoverrides contains flavor-specific corrections for game data
// whose effective behavior cannot be inferred from the imported client tables.
package gamedataoverrides

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type spellMutation func(*chrondbc.Spell)

var spellOverrides = []struct {
	flavor  database.FlavorTag
	spellID int32
	mutate  spellMutation
}{
	{
		flavor:  database.FlavorNightmareOfUrsol,
		spellID: 45708,
		mutate: func(spell *chrondbc.Spell) {
			// Berserk applies the 20-second form-specific auras 45709/45710.
			spell.Duration.Duration = 20_000
			spell.Duration.MaxDuration = 20_000
		},
	},
}

// ApplySpell applies every hardcoded mutation matching the spell and flavor.
// Mutations may correct any property on the canonical spell.
func ApplySpell(flavor database.WoWFlavor, spell *chrondbc.Spell) {
	if spell == nil {
		return
	}
	for _, entry := range spellOverrides {
		if entry.spellID == int32(spell.ID) && flavor.Has(entry.flavor) {
			entry.mutate(spell)
		}
	}
}
