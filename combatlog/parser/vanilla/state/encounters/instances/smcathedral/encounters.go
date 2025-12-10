package smcathedral

import (
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
)

// Known boss names in Scarlet Monastery Cathedral
const (
	BossWhitemane      = "High Inquisitor Whitemane"
	BossMograine       = "Scarlet Commander Mograine"
	BossFairbanks      = "High Inquisitor Fairbanks"
	MinibossArcanist   = "Scarlet Torturer"
	MinibossDoan       = "Arcanist Doan"
)

// NewWhitemaneEncounter creates the Whitemane encounter
func NewWhitemaneEncounter() encounters.Encounter {
	return encounters.NewBaseEncounter(
		"High Inquisitor Whitemane",
		encounters.EncounterRules{
			BossNames: []string{
				BossWhitemane,
			},
			// Mograine is also part of this fight
			AdditionalEnemyNames: []string{
				BossMograine,
			},
			MinPlayers:     5,
			TimeoutSeconds: 45,
		},
	)
}

// NewMograineEncounter creates the Mograine encounter
// Note: This is typically the same as Whitemane, but can be separate
func NewMograineEncounter() encounters.Encounter {
	return encounters.NewBaseEncounter(
		"Scarlet Commander Mograine",
		encounters.EncounterRules{
			BossNames: []string{
				BossMograine,
			},
			MinPlayers:     5,
			TimeoutSeconds: 45,
		},
	)
}

// NewFairbanksEncounter creates the Fairbanks encounter
func NewFairbanksEncounter() encounters.Encounter {
	return encounters.NewBaseEncounter(
		"High Inquisitor Fairbanks",
		encounters.EncounterRules{
			BossNames: []string{
				BossFairbanks,
			},
			MinPlayers:     5,
			TimeoutSeconds: 45,
		},
	)
}
