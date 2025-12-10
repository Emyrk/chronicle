package smcathedral

import (
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
)

// WhitemaneEncounter is a custom implementation for the Whitemane fight
// This showcases how to add custom logic for complex encounters
type WhitemaneEncounter struct {
	*encounters.BaseEncounter

	// Track whether Mograine was killed first
	mograineKilledFirst bool
	whitemaneRezzed     bool
}

func NewWhitemaneEncounterCustom() *WhitemaneEncounter {
	base := encounters.NewBaseEncounter(
		"High Inquisitor Whitemane & Scarlet Commander Mograine",
		encounters.EncounterRules{
			BossNames: []string{
				BossWhitemane,
				BossMograine,
			},
			MinPlayers:     5,
			TimeoutSeconds: 60, // Longer timeout for this complex fight
			// Custom success condition: both bosses must be dead
			SuccessCondition: func(f *encounters.Fight) bool {
				whitemaneDead := false
				mograineDead := false

				for gid, lives := range f.Lives {
					info, ok := f.db.Get(gid)
					if !ok {
						continue
					}

					if info.Name == BossWhitemane && !lives.IsActive() {
						whitemaneDead = true
					}
					if info.Name == BossMograine && !lives.IsActive() {
						mograineDead = true
					}
				}

				return whitemaneDead && mograineDead
			},
		},
	)

	return &WhitemaneEncounter{
		BaseEncounter: base,
	}
}

func (w *WhitemaneEncounter) OnStart(f *encounters.Fight) error {
	// Reset state for this attempt
	w.mograineKilledFirst = false
	w.whitemaneRezzed = false
	return nil
}

func (w *WhitemaneEncounter) OnEnd(f *encounters.Fight, result encounters.FightResult) error {
	// Log interesting information about how the fight went
	// This could be used for analytics or achievements
	return nil
}

// Process can be called for custom per-message logic
func (w *WhitemaneEncounter) Process(f *encounters.Fight, m messages.Message) error {
	// Example: Track if Whitemane resurrects Mograine
	if slain, ok := m.(messages.Slain); ok {
		info, exists := f.db.Get(slain.Victim)
		if exists && info.Name == BossMograine {
			w.mograineKilledFirst = true
		}
	}

	// Example: Detect resurrection spell
	if cast, ok := m.(messages.Cast); ok {
		casterInfo, exists := f.db.Get(cast.Caster.Gid)
		if exists && casterInfo.Name == BossWhitemane {
			// Check if it's a resurrection spell (you'd need to know the spell name)
			// if cast.Spell.Name == "Scarlet Resurrection" {
			//     w.whitemaneRezzed = true
			// }
		}
	}

	return nil
}
