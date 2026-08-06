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
	Visibility  string          `json:"visibility"`
	Payload     json.RawMessage `json:"payload"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`

	// Fork lineage; nil when the list was not forked. A nil revision
	// number on a forked list means it was forked from the live draft.
	ForkedFromListID    *uuid.UUID `json:"forked_from_list_id,omitempty"`
	ForkedFromRevNumber *int32     `json:"forked_from_rev_number,omitempty"`
}

// GearListRevision is an immutable published snapshot of a gear list.
type GearListRevision struct {
	ID          uuid.UUID       `json:"id"`
	ListID      uuid.UUID       `json:"list_id"`
	RevNumber   int32           `json:"rev_number"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	ClassID     int32           `json:"class_id"`
	SpecName    string          `json:"spec_name"`
	Payload     json.RawMessage `json:"payload"`
	PublishedBy uuid.UUID       `json:"published_by"`
	PublishedAt time.Time       `json:"published_at"`
}

// GearListRevisionSummary is a revision without its payload, for pickers.
type GearListRevisionSummary struct {
	ID          uuid.UUID `json:"id"`
	ListID      uuid.UUID `json:"list_id"`
	RevNumber   int32     `json:"rev_number"`
	Title       string    `json:"title"`
	PublishedBy uuid.UUID `json:"published_by"`
	PublishedAt time.Time `json:"published_at"`
}

// ForkGearListRequest is the request body for forking a gear list.
type ForkGearListRequest struct {
	// RevNumber selects a published revision to fork; omitted forks the
	// live draft state.
	RevNumber *int32 `json:"rev_number,omitempty"`
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
	Visibility  string          `json:"visibility"`
	Payload     json.RawMessage `json:"payload"`
}

// UpdateGearListRequest is the request body for updating a gear list.
type UpdateGearListRequest struct {
	Title       *string          `json:"title,omitempty"`
	Description *string          `json:"description,omitempty"`
	ClassID     *int32           `json:"class_id,omitempty"`
	SpecName    *string          `json:"spec_name,omitempty"`
	Visibility  *string          `json:"visibility,omitempty"`
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

// GearStatWeightPin is an admin-pinned stat weight reference.
type GearStatWeightPin struct {
	ID           uuid.UUID `json:"id"`
	TenantID     uuid.UUID `json:"tenant_id"`
	DatasetID    uuid.UUID `json:"dataset_id"`
	StatWeightID uuid.UUID `json:"stat_weight_id"`
	PinnedBy     uuid.UUID `json:"pinned_by"`
	CreatedAt    time.Time `json:"created_at"`

	// Resolved stat weight fields (populated on list).
	StatWeightName        string          `json:"stat_weight_name,omitempty"`
	StatWeightDescription string          `json:"stat_weight_description,omitempty"`
	StatWeightClassID     int32           `json:"stat_weight_class_id,omitempty"`
	StatWeightSpecName    string          `json:"stat_weight_spec_name,omitempty"`
	StatWeightWeights     json.RawMessage `json:"stat_weight_weights,omitempty"`
	StatWeightUserID      uuid.UUID       `json:"stat_weight_user_id,omitempty"`
}

// CreateGearStatWeightPinRequest is the request body for pinning a stat weight.
type CreateGearStatWeightPinRequest struct {
	DatasetID    uuid.UUID `json:"dataset_id"`
	StatWeightID uuid.UUID `json:"stat_weight_id"`
}
