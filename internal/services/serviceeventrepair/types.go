// Package serviceeventrepair owns audited, versioned repairs of derived event data.
// Original event streams are immutable and must never be rewritten by a repair.
package serviceeventrepair

import (
	"errors"
	"github.com/google/uuid"
	"time"
)

const OperationRazorgore = "razorgore-phase-two"
const Version = 1
const PageSize = 25

var (
	ErrInvalid  = errors.New("invalid event repair request")
	ErrConflict = errors.New("event repair state conflict")
	ErrNotFound = errors.New("event repair not found")
)

type CreateRequest struct {
	Operation string     `json:"operation"`
	Instance  string     `json:"instance,omitempty"`
	TenantID  uuid.UUID  `json:"tenant_id"`
	Limit     int        `json:"limit,omitempty"`
	RealmID   uuid.UUID  `json:"realm_id"`
	After     *time.Time `json:"after,omitempty"`
	Before    *time.Time `json:"before,omitempty"`
}
type Operation struct {
	ID        uuid.UUID     `json:"id"`
	Operation string        `json:"operation"`
	Version   int           `json:"version"`
	State     string        `json:"state"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
	CreatedBy uuid.UUID     `json:"created_by"`
	TenantID  uuid.UUID     `json:"tenant_id"`
	Selection CreateRequest `json:"selection"`
	Total     int           `json:"total"`
	Processed int           `json:"processed"`
	Applied   int           `json:"applied"`
	Skipped   int           `json:"skipped"`
	LastError string        `json:"last_error"`
	Items     []Item        `json:"items"`
}
type Item struct {
	Warnings      []string       `json:"warnings,omitempty"`
	Details       map[string]any `json:"details,omitempty"`
	InstanceID    uuid.UUID      `json:"instance_id"`
	State         string         `json:"state"`
	Reason        string         `json:"reason"`
	EvidenceHash  string         `json:"evidence_hash"`
	Changes       []string       `json:"changes"`
	RatingsQueued bool           `json:"ratings_queued"`
}
