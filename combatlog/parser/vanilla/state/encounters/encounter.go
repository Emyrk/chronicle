package encounters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

// Encounter represents a specific boss fight or encounter within an instance
type Encounter interface {
	// Name returns the encounter name (e.g., "High Inquisitor Whitemane")
	Name() string

	// Detect checks if this message indicates this encounter has started
	// This is called to identify which encounter a fight belongs to
	Detect(f *Fight, m messages.Message) bool

	// OnStart is called when the encounter is detected
	OnStart(f *Fight) error

	// OnEnd is called when the encounter ends
	OnEnd(f *Fight, result FightResult) error

	// Rules returns the rules for this encounter
	Rules() EncounterRules
}

// FightResult indicates how a fight ended
type FightResult int

const (
	FightResultUnknown FightResult = iota
	FightResultSuccess // Boss killed
	FightResultWipe    // Party wiped
	FightResultTimeout // Combat timed out
)

func (r FightResult) String() string {
	switch r {
	case FightResultSuccess:
		return "Success"
	case FightResultWipe:
		return "Wipe"
	case FightResultTimeout:
		return "Timeout"
	default:
		return "Unknown"
	}
}

// EncounterRules defines the rules for detecting and completing an encounter
type EncounterRules struct {
	// BossNames are the unit names that identify this boss
	BossNames []string

	// AdditionalEnemyNames are other enemies that are part of this encounter
	AdditionalEnemyNames []string

	// MinPlayers is the minimum number of players for this to be a valid encounter
	MinPlayers int

	// SuccessCondition is a custom function to determine if the encounter succeeded
	// If nil, defaults to "all boss units dead"
	SuccessCondition func(f *Fight) bool

	// FailCondition is a custom function to determine if the encounter failed
	// If nil, defaults to "all friendly units dead"
	FailCondition func(f *Fight) bool

	// TimeoutSeconds is how long with no activity before considering the fight timed out
	TimeoutSeconds int
}

// BaseEncounter provides common encounter functionality
type BaseEncounter struct {
	name  string
	rules EncounterRules
}

func NewBaseEncounter(name string, rules EncounterRules) *BaseEncounter {
	// Set defaults
	if rules.TimeoutSeconds == 0 {
		rules.TimeoutSeconds = 30
	}

	return &BaseEncounter{
		name:  name,
		rules: rules,
	}
}

func (e *BaseEncounter) Name() string {
	return e.name
}

func (e *BaseEncounter) Rules() EncounterRules {
	return e.rules
}

// Detect checks if any of the boss names appear in the fight
func (e *BaseEncounter) Detect(f *Fight, m messages.Message) bool {
	// Check if any boss names match units in the fight
	for gid := range f.Lives {
		info, ok := f.db.Get(gid)
		if !ok {
			continue
		}

		for _, bossName := range e.rules.BossNames {
			if info.Name == bossName {
				return true
			}
		}
	}

	return false
}

func (e *BaseEncounter) OnStart(f *Fight) error {
	// Default: nothing special
	return nil
}

func (e *BaseEncounter) OnEnd(f *Fight, result FightResult) error {
	// Default: nothing special
	return nil
}

// BossGUIDs returns the GUIDs of all boss units in the fight
func (e *BaseEncounter) BossGUIDs(f *Fight) []guid.GUID {
	var bosses []guid.GUID

	for gid := range f.Lives {
		info, ok := f.db.Get(gid)
		if !ok {
			continue
		}

		for _, bossName := range e.rules.BossNames {
			if info.Name == bossName {
				bosses = append(bosses, gid)
				break
			}
		}
	}

	return bosses
}

// AllBossesDead checks if all boss units are dead
func (e *BaseEncounter) AllBossesDead(f *Fight) bool {
	bosses := e.BossGUIDs(f)
	if len(bosses) == 0 {
		return false
	}

	for _, bossGUID := range bosses {
		lives, ok := f.Lives[bossGUID]
		if !ok || lives.IsActive() {
			return false
		}
	}

	return true
}
