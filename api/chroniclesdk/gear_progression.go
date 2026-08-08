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
