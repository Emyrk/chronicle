package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// GearList is a user-owned gear progression list.
type GearList struct {
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

	// Fork lineage; nil when the list was not forked.
	ForkedFromListID *uuid.UUID `json:"forked_from_list_id,omitempty"`
}

// GearListPayload is the versioned document stored in GearList.Payload.
type GearListPayload struct {
	Version int32           `json:"version"`
	Stages  []GearListStage `json:"stages"`
}

// GearListStage is one stage of a gear progression. Slot keys are the
// 19 PlayerOutfit indexes ("0".."18"); slots without an item are absent.
type GearListStage struct {
	Name  string                  `json:"name"`
	Slots map[string]GearListSlot `json:"slots"`
	// Level is the character level this stage assumes (its item picker
	// filters to it). Nil means the level slider is disabled for the
	// stage and the level cap is assumed.
	Level *int32 `json:"level,omitempty"`
}

// GearListSlot is the primary pick for one equipment slot plus its
// ranked alternates and an optional author note.
type GearListSlot struct {
	ItemID     int32               `json:"item_id"`
	EnchantID  *int32              `json:"enchant_id,omitempty"`
	Note       string              `json:"note,omitempty"`
	Alternates []GearListAlternate `json:"alternates,omitempty"`
}

// GearListAlternate is a ranked alternate item for a slot; array order
// is the rank.
type GearListAlternate struct {
	ItemID int32  `json:"item_id"`
	Note   string `json:"note,omitempty"`
}

// CreateGearListRequest is the request body for creating a gear list.
type CreateGearListRequest struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	ClassID     int32           `json:"class_id"`
	SpecName    string          `json:"spec_name"`
	Payload     json.RawMessage `json:"payload"`
}

// UpdateGearListRequest is the request body for updating a gear list.
type UpdateGearListRequest struct {
	Title       *string          `json:"title,omitempty"`
	Description *string          `json:"description,omitempty"`
	ClassID     *int32           `json:"class_id,omitempty"`
	SpecName    *string          `json:"spec_name,omitempty"`
	Payload     *json.RawMessage `json:"payload,omitempty"`
}

// GearStatWeight is a user-defined stat-weight set.
type GearStatWeight struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	TenantID    uuid.UUID       `json:"tenant_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	ClassID     int32           `json:"class_id"`
	SpecName    string          `json:"spec_name"`
	Weights     json.RawMessage `json:"weights"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// CreateGearStatWeightRequest is the request body for creating a stat weight.
type CreateGearStatWeightRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	ClassID     int32           `json:"class_id"`
	SpecName    string          `json:"spec_name"`
	Weights     json.RawMessage `json:"weights"`
}

// UpdateGearStatWeightRequest is the request body for updating a stat weight.
type UpdateGearStatWeightRequest struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	ClassID     *int32           `json:"class_id,omitempty"`
	SpecName    *string          `json:"spec_name,omitempty"`
	Weights     *json.RawMessage `json:"weights,omitempty"`
}
