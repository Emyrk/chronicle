// Package gamedataoverrides contains flavor-specific corrections for game data
// whose effective behavior cannot be inferred from the imported client tables.
package gamedataoverrides

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type spellMutation func(*chrondbc.Spell, map[chrondbc.SpellID]*chrondbc.Spell)

type spellOverride struct {
	flavor           database.FlavorTag
	spellID          chrondbc.SpellID
	allClassCooldown bool
	mutate           spellMutation
}

var spellOverrides = []spellOverride{
	{
		flavor:  database.FlavorNightmareOfUrsol,
		spellID: 45708,
		mutate: func(spell *chrondbc.Spell, _ map[chrondbc.SpellID]*chrondbc.Spell) {
			// Berserk applies the 20-second form-specific auras 45709/45710.
			spell.Duration.Duration = 20_000
			spell.Duration.MaxDuration = 20_000
		},
	},
	{
		flavor:  database.FlavorVanilla,
		spellID: 31818,
		mutate: func(spell *chrondbc.Spell, spells map[chrondbc.SpellID]*chrondbc.Spell) {
			cast := spells[1454]
			if cast == nil {
				return
			}
			spell.SpellIcon = cast.SpellIcon
			spell.SpellIconID_ = cast.SpellIconID_
		},
	},
	{
		flavor:           database.FlavorVanilla,
		spellID:          20572,
		allClassCooldown: true,
		mutate: func(spell *chrondbc.Spell, spells map[chrondbc.SpellID]*chrondbc.Spell) {
			aura := spells[23234]
			if aura == nil {
				return
			}
			// The cast owns the cooldown while the triggered aura owns the duration.
			spell.Duration = aura.Duration
			spell.DurationIndex_ = aura.DurationIndex_
			if spell.Duration.MaxDuration <= 0 {
				spell.Duration.ID = aura.DurationIndex_
				spell.Duration.Duration = 15_000
				spell.Duration.MaxDuration = 15_000
			}
		},
	},
	{
		flavor:  database.FlavorVanilla,
		spellID: 23234,
		mutate: func(spell *chrondbc.Spell, spells map[chrondbc.SpellID]*chrondbc.Spell) {
			cast := spells[20572]
			if cast == nil {
				return
			}
			spell.Description_lang = cast.Description_lang
			spell.SpellIcon = cast.SpellIcon
			spell.SpellIconID_ = cast.SpellIconID_
			if spell.Duration.MaxDuration <= 0 {
				spell.Duration.ID = spell.DurationIndex_
				spell.Duration.Duration = 15_000
				spell.Duration.MaxDuration = 15_000
			}
		},
	},
	{
		flavor:           database.FlavorVanilla,
		spellID:          20554,
		allClassCooldown: true,
		mutate: func(spell *chrondbc.Spell, spells map[chrondbc.SpellID]*chrondbc.Spell) {
			aura := spells[26635]
			if aura == nil {
				return
			}
			// The cast owns the cooldown while the triggered aura owns the duration.
			spell.Duration = aura.Duration
			spell.DurationIndex_ = aura.DurationIndex_
			if spell.Duration.MaxDuration <= 0 {
				spell.Duration.ID = aura.DurationIndex_
				spell.Duration.Duration = 10_000
				spell.Duration.MaxDuration = 10_000
			}
		},
	},
	{
		flavor:  database.FlavorVanilla,
		spellID: 26635,
		mutate: func(spell *chrondbc.Spell, spells map[chrondbc.SpellID]*chrondbc.Spell) {
			cast := spells[20554]
			if cast == nil {
				return
			}
			// Combat logs use this triggered aura as a second Berserking cast. Give
			// it the cast spell's tooltip metadata while retaining its aura text.
			spell.Description_lang = cast.Description_lang
			spell.SpellIcon = cast.SpellIcon
			spell.SpellIconID_ = cast.SpellIconID_
			if spell.Duration.MaxDuration <= 0 {
				spell.Duration.ID = spell.DurationIndex_
				spell.Duration.Duration = 10_000
				spell.Duration.MaxDuration = 10_000
			}
		},
	},
}

// ApplySpells applies every hardcoded mutation matching the flavor. The full
// spell set is available so split cast/aura records can inherit from each other.
func ApplySpells(flavor database.WoWFlavor, spells []*chrondbc.Spell) {
	byID := make(map[chrondbc.SpellID]*chrondbc.Spell, len(spells))
	for _, spell := range spells {
		if spell != nil {
			byID[spell.ID] = spell
		}
	}
	for _, entry := range spellOverrides {
		spell := byID[entry.spellID]
		if spell != nil && flavor.Has(entry.flavor) {
			entry.mutate(spell, byID)
		}
	}
}

// ApplySpell applies mutations that do not depend on another spell.
func ApplySpell(flavor database.WoWFlavor, spell *chrondbc.Spell) {
	ApplySpells(flavor, []*chrondbc.Spell{spell})
}

// IsAllClassCooldown reports whether a spell should be available to every
// player class in the Cooldown Usage panel.
func IsAllClassCooldown(flavor database.WoWFlavor, spellID chrondbc.SpellID) bool {
	for _, entry := range spellOverrides {
		if entry.spellID == spellID && entry.allClassCooldown && flavor.Has(entry.flavor) {
			return true
		}
	}
	return false
}
