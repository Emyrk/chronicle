package chroniclesdk

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type Session struct {
	UserID    uuid.UUID `json:"user_id"`
	SessionID uuid.UUID `json:"session_id"`
	Roles     []string  `json:"roles"`
}

type User struct {
	ID                     uuid.UUID          `json:"id"`
	Username               string             `json:"username"`
	Email                  string             `json:"email"`
	Roles                  []string           `json:"roles"`
	CreatedAt              string             `json:"created_at"`
	UpdatedAt              string             `json:"updated_at"`
	MaxStorageBytes        int64              `json:"max_storage_bytes"`
	MaxStorageBytesUpdated pgtype.Timestamptz `json:"max_storage_bytes_updated"`
	ConsumedStorageBytes   int64              `json:"consumed_storage_bytes"`
}

type AdminUsersResponse struct {
	Users []User `json:"users"`
}

type AdminLogsResponse struct {
	Logs []AdminLog `json:"logs"`
}

type AdminLog struct {
	ID          uuid.UUID `json:"id"`
	OwnerID     uuid.UUID `json:"owner_id"`
	OwnerName   string    `json:"owner_name"`
	Description string    `json:"description"`
	CreatedAt   string    `json:"created_at"`
	State       string    `json:"state"`
}
