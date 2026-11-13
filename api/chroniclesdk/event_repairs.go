package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

type CreateEventRepairRequest struct {
	Operation string     `json:"operation"`
	Instance  string     `json:"instance"`
	TenantID  uuid.UUID  `json:"tenant_id"`
	Limit     int        `json:"limit"`
	RealmID   uuid.UUID  `json:"realm_id"`
	After     *time.Time `json:"after"`
	Before    *time.Time `json:"before"`
}

type EventRepairOperation struct {
	ID        uuid.UUID                `json:"id"`
	Operation string                   `json:"operation"`
	Version   int                      `json:"version"`
	State     string                   `json:"state"`
	CreatedAt time.Time                `json:"created_at"`
	UpdatedAt time.Time                `json:"updated_at"`
	CreatedBy uuid.UUID                `json:"created_by"`
	TenantID  uuid.UUID                `json:"tenant_id"`
	Selection CreateEventRepairRequest `json:"selection"`
	Total     int                      `json:"total"`
	Processed int                      `json:"processed"`
	Applied   int                      `json:"applied"`
	Skipped   int                      `json:"skipped"`
	LastError string                   `json:"last_error"`
	Items     []EventRepairItem        `json:"items"`
}

type EventRepairItem struct {
	InstanceID   uuid.UUID `json:"instance_id"`
	State        string    `json:"state"`
	Reason       string    `json:"reason"`
	EvidenceHash string    `json:"evidence_hash"`
	Changes      []string  `json:"changes"`
}

type EventRepairOperationsResponse struct {
	Operations []EventRepairOperation `json:"operations"`
}
