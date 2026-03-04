package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type UserPanelLayout struct {
	ID            uuid.UUID       `json:"id"`
	Title         string          `json:"title"`
	Icon          string          `json:"icon"`
	Description   string          `json:"description"`
	Payload       json.RawMessage `json:"payload"`
	Version       int32           `json:"version"`
	OwnerID       *uuid.UUID      `json:"owner_id"`
	OwnerUsername *string         `json:"owner_username"`
	IsTracked     bool            `json:"is_tracked"`
	TrackerCount  int64           `json:"tracker_count"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// TrackLayoutRequest identifies a layout to track.
type TrackLayoutRequest struct {
	LayoutID uuid.UUID `json:"layout_id"`
}

type CreateUserPanelLayoutRequest struct {
	Title       string          `json:"title"`
	Icon        string          `json:"icon"`
	Description string          `json:"description"`
	Payload     json.RawMessage `json:"payload"`
}

type UpdateUserPanelLayoutRequest struct {
	Title       *string          `json:"title,omitempty"`
	Icon        *string          `json:"icon,omitempty"`
	Description *string          `json:"description,omitempty"`
	Payload     *json.RawMessage `json:"payload,omitempty"`
}

type ListUserPanelLayoutsResponse struct {
	Layouts []UserPanelLayout `json:"layouts"`
}
