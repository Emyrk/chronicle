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
	ID        uuid.UUID       `json:"id"`
	UserID    uuid.UUID       `json:"user_id"`
	TenantID  uuid.UUID       `json:"tenant_id"`
	Name      string          `json:"name"`
	ClassID   int32           `json:"class_id"`
	SpecName  string          `json:"spec_name"`
	Weights   json.RawMessage `json:"weights"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// CreateGearStatWeightRequest is the request body for creating a stat weight.
type CreateGearStatWeightRequest struct {
	Name     string          `json:"name"`
	ClassID  int32           `json:"class_id"`
	SpecName string          `json:"spec_name"`
	Weights  json.RawMessage `json:"weights"`
}

// UpdateGearStatWeightRequest is the request body for updating a stat weight.
type UpdateGearStatWeightRequest struct {
	Name     *string          `json:"name,omitempty"`
	ClassID  *int32           `json:"class_id,omitempty"`
	SpecName *string          `json:"spec_name,omitempty"`
	Weights  *json.RawMessage `json:"weights,omitempty"`
}

// GearStatWeightPin is an admin-pinned stat weight reference.
type GearStatWeightPin struct {
	ID           uuid.UUID       `json:"id"`
	TenantID     uuid.UUID       `json:"tenant_id"`
	DatasetID    uuid.UUID       `json:"dataset_id"`
	StatWeightID uuid.UUID       `json:"stat_weight_id"`
	PinnedBy     uuid.UUID       `json:"pinned_by"`
	CreatedAt    time.Time       `json:"created_at"`

	// Resolved stat weight fields (populated on list).
	StatWeightName     string          `json:"stat_weight_name,omitempty"`
	StatWeightClassID  int32           `json:"stat_weight_class_id,omitempty"`
	StatWeightSpecName string          `json:"stat_weight_spec_name,omitempty"`
	StatWeightWeights  json.RawMessage `json:"stat_weight_weights,omitempty"`
	StatWeightUserID   uuid.UUID       `json:"stat_weight_user_id,omitempty"`
}

// CreateGearStatWeightPinRequest is the request body for pinning a stat weight.
type CreateGearStatWeightPinRequest struct {
	DatasetID    uuid.UUID `json:"dataset_id"`
	StatWeightID uuid.UUID `json:"stat_weight_id"`
}
