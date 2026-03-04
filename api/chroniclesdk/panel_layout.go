package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type UserPanelLayout struct {
	ID          uuid.UUID       `json:"id"`
	Title       string          `json:"title"`
	Icon        string          `json:"icon"`
	Description string          `json:"description"`
	Payload     json.RawMessage `json:"payload"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
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
