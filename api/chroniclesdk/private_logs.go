package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type UpdateLogPrivacyRequest struct {
	Private bool `json:"private"`
}

type PrivateLogShareLink struct {
	ID         uuid.UUID `json:"id"`
	LogGroupID uuid.UUID `json:"log_group_id"`
	Code       string    `json:"code"`
	URL        string    `json:"url"`
	CreatedAt  time.Time `json:"created_at"`
}

type PrivateLogShareResolution struct {
	LogGroupID   uuid.UUID `json:"log_group_id"`
	OwnerName    string    `json:"owner_name"`
	Private      bool      `json:"private"`
	AccessStatus string    `json:"access_status,omitempty"`
}

type PrivateLogAccessRequest struct {
	ID            uuid.UUID  `json:"id"`
	LogGroupID    uuid.UUID  `json:"log_group_id"`
	RequesterID   uuid.UUID  `json:"requester_id"`
	RequesterName string     `json:"requester_name,omitempty"`
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	DecidedBy     *uuid.UUID `json:"decided_by,omitempty"`
	DecidedAt     *time.Time `json:"decided_at,omitempty"`
}
