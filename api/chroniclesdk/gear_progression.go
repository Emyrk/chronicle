package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// GearProgression is a user-owned gear progression: one player-picked
// pool of items that drives a leveling scrubber, plus explicit stage
// snapshots for the max-level half of the journey.
type GearProgression struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	TenantID    uuid.UUID       `json:"tenant_id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	ClassID     int32           `json:"class_id"`
	SpecName    string          `json:"spec_name"`
	Payload     json.RawMessage `json:"payload"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// GearProgressionPayload is the versioned document stored in
// GearProgression.Payload. Best-per-slot for the leveling axis is derived
// from Pool at render time and never stored.
type GearProgressionPayload struct {
	Version int32                     `json:"version"`
	Pool    []GearProgressionPoolItem `json:"pool"`
	// Stages reuses the gear-list stage shape for the max-level axis.
	Stages []GearListStage `json:"stages"`
	// AnalysisProfileID retains the source profile for owner-side selection.
	AnalysisProfileID string `json:"analysis_profile_id,omitempty"`
	// AnalysisProfile snapshots the selected profile so shared progressions can
	// score gear without access to the owner's private stat-weight records.
	AnalysisProfile *GearProgressionAnalysisProfile `json:"analysis_profile,omitempty"`
	// LevelingDisabled turns the progressive-gear (levelling) half off
	// for the whole document; everything assumes the level cap.
	LevelingDisabled bool `json:"leveling_disabled,omitempty"`
}

// GearProgressionAnalysisProfile is a portable snapshot of a stat-weight profile.
type GearProgressionAnalysisProfile struct {
	ID          string                          `json:"id"`
	Name        string                          `json:"name"`
	Description string                          `json:"description,omitempty"`
	Weights     map[string]float64              `json:"weights"`
	Targets     []GearProgressionAnalysisTarget `json:"targets,omitempty"`
}

// GearProgressionAnalysisTarget is a raw-stat minimum or maximum constraint.
type GearProgressionAnalysisTarget struct {
	Stat  string  `json:"stat"`
	Type  string  `json:"type"`
	Value float64 `json:"value"`
}

// GearProgressionPoolItem is one hand-picked item in the pool.
type GearProgressionPoolItem struct {
	ItemID    int32  `json:"item_id"`
	EnchantID *int32 `json:"enchant_id,omitempty"`
	Note      string `json:"note,omitempty"`
}

// CreateGearProgressionRequest is the request body for creating a progression.
type CreateGearProgressionRequest struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	ClassID     int32           `json:"class_id"`
	SpecName    string          `json:"spec_name"`
	Payload     json.RawMessage `json:"payload"`
}

// UpdateGearProgressionRequest is the request body for updating a progression.
type UpdateGearProgressionRequest struct {
	Title       *string          `json:"title,omitempty"`
	Description *string          `json:"description,omitempty"`
	ClassID     *int32           `json:"class_id,omitempty"`
	SpecName    *string          `json:"spec_name,omitempty"`
	Payload     *json.RawMessage `json:"payload,omitempty"`
}
