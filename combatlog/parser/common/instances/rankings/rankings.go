package rankings

import (
	"time"

	"github.com/google/uuid"

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

// LevelRangeRequirement constrains the player levels allowed in a qualifying speedrun.
type LevelRangeRequirement struct {
	MinLevel int32 `json:"min_level"`
	MaxLevel int32 `json:"max_level"`
}

// SpeedrunRules defines all requirements for a valid speedrun.
const (
	DefaultReentryGap = 24 * time.Hour
	DungeonReentryGap = 15 * time.Minute
)

type SpeedrunRules struct {
	Requirements []SpeedrunRequirement  `json:"requirements"`
	LevelRange   *LevelRangeRequirement `json:"level_range,omitempty"`
	// ReentryGap controls when a completed run can be split from a later entry
	// into the same zone. Zero uses DefaultReentryGap.
	ReentryGap time.Duration `json:"-"`
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

// LevelViolation records a single player that violated the level range.
type LevelViolation struct {
	PlayerName string    `json:"player_name"`
	PlayerGUID guid.GUID `json:"player_guid"`
	Level      int32     `json:"level"`
}

// LevelRangeResult shows whether the level range was satisfied and who violated it.
type LevelRangeResult struct {
	Requirement LevelRangeRequirement `json:"requirement"`
	Satisfied   bool                  `json:"satisfied"`
	Violators   []LevelViolation      `json:"violators"`
}

// SpeedrunResult is the outcome of evaluating speedrun rules against an instance.
type SpeedrunResult struct {
	Qualified      bool              `json:"qualified"`
	StartTime      time.Time         `json:"start_time"`
	CompletionTime time.Time         `json:"completion_time"`
	Duration       time.Duration     `json:"duration"`
	Proof          []SpeedrunProof   `json:"proof"`
	LevelRange     *LevelRangeResult `json:"level_range,omitempty"`
}

// SpeedrunProofPayload is the JSON structure stored in the database proof column.
// It wraps the proof array alongside optional level range data.
type SpeedrunProofPayload struct {
	Proof      []SpeedrunProof   `json:"proof"`
	LevelRange *LevelRangeResult `json:"level_range,omitempty"`
}

// RankingsResult holds results from all ranking evaluations.
type RankingsResult struct {
	Speedrun *SpeedrunResult `json:"speedrun,omitempty"`
	// DPS maps encounter ID → per-unit damage results.
	DPS map[uuid.UUID]*DPSResult `json:"-"`
}
