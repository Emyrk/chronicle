package rankings

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// --- Rules (input, JSON-serializable for frontend) ---

// SpeedrunRequirement defines a group of mobs that must be killed to satisfy
// one line item of a speedrun. Multiple EntryIDs allow different creature
// variants to count toward the same requirement.
// SpeedrunRequirementCategory groups requirements for display.
type SpeedrunRequirementCategory string

const (
	SpeedrunCategoryBosses SpeedrunRequirementCategory = "Bosses"
	SpeedrunCategoryTrash  SpeedrunRequirementCategory = "Trash"
)

type SpeedrunRequirement struct {
	Name     string                      `json:"name"`
	EntryIDs []uint32                    `json:"entry_ids"`
	Count    int                         `json:"count"`
	Category SpeedrunRequirementCategory `json:"category"`
}

// SpeedrunRules defines all requirements for a valid speedrun.
type SpeedrunRules struct {
	Requirements []SpeedrunRequirement `json:"requirements"`
}

// Rankings holds all rule sets for an instance.
// Nil sub-fields mean that ranking category doesn't apply.
type Rankings struct {
	Speedrun *SpeedrunRules `json:"speedrun,omitempty"`
	// Future: DPS *DPSRules, etc.
}

// --- Proof (output, JSON-serializable) ---

// KillRecord captures a single kill contributing to a requirement.
type KillRecord struct {
	EntryID   uint32    `json:"entry_id"`
	GUID      guid.GUID `json:"guid"`
	Timestamp time.Time `json:"timestamp"`
}

// SpeedrunProof ties a requirement to the kills that satisfied (or failed to
// satisfy) it. Proof is always emitted for every requirement regardless of
// whether it was satisfied.
type SpeedrunProof struct {
	Requirement SpeedrunRequirement `json:"requirement"`
	Kills       []KillRecord        `json:"kills"`
	Satisfied   bool                `json:"satisfied"`
}

// SpeedrunResult is the outcome of evaluating speedrun rules against an instance.
type SpeedrunResult struct {
	Qualified      bool            `json:"qualified"`
	StartTime      time.Time       `json:"start_time"`
	CompletionTime time.Time       `json:"completion_time"`
	Duration       time.Duration   `json:"duration"`
	Proof          []SpeedrunProof `json:"proof"`
}

// RankingsResult holds results from all ranking evaluations.
type RankingsResult struct {
	Speedrun *SpeedrunResult `json:"speedrun,omitempty"`
	// Future: DPS *DPSResult, etc.
}
