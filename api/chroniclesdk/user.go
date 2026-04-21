package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type Session struct {
	UserID               uuid.UUID   `json:"user_id"`
	SessionID            uuid.UUID   `json:"session_id"`
	Roles                []string    `json:"roles"`
	MaxStorageBytes      int64       `json:"max_storage_bytes"`
	ConsumedStorageBytes int64       `json:"consumed_storage_bytes"`
	Preferences          Preferences `json:"preferences"`
	// Email is the user's email address (if available).
	Email string `json:"email"`
	// EmailVerified indicates whether the user's email has been verified.
	// Only meaningful for password-auth users.
	EmailVerified bool `json:"email_verified"`
	// AuthProvider is the provider used for the current session (e.g. "discord", "password").
	AuthProvider string `json:"auth_provider"`
}

type Preferences struct {
	HelpfulHints bool `json:"helpful_hints"`
}

type User struct {
	ID                     uuid.UUID `json:"id"`
	Username               string    `json:"username"`
	Email                  string    `json:"email"`
	Roles                  []string  `json:"roles"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
	MaxStorageBytes        int64     `json:"max_storage_bytes"`
	MaxStorageBytesUpdated time.Time `json:"max_storage_bytes_updated"`
	ConsumedStorageBytes   int64     `json:"consumed_storage_bytes"`
}

type AdminUsersResponse struct {
	Users []User `json:"users"`
}

type AdminLogsResponse struct {
	Logs       []AdminLog `json:"logs"`
	HasMore    bool       `json:"has_more"`
	TotalCount int        `json:"total_count"`
}

type AdminLog struct {
	ID            uuid.UUID `json:"id"`
	OwnerID       uuid.UUID `json:"owner_id"`
	OwnerName     string    `json:"owner_name"`
	Description   string    `json:"description"`
	CreatedAt     string    `json:"created_at"`
	State         string    `json:"state"`
	SizeBytes     int64     `json:"size_bytes"`
	InstanceNames []string  `json:"instance_names"`
}

// DataGrant represents a storage grant given to a user from various sources
type DataGrant struct {
	ID           string     `json:"id"`
	Source       string     `json:"source"`
	StorageBytes int64      `json:"storage_bytes"`
	Description  string     `json:"description,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
}

// UserStorageInfo contains storage usage and grant breakdown for a user
type UserStorageInfo struct {
	MaxStorageBytes      int64       `json:"max_storage_bytes"`
	ConsumedStorageBytes int64       `json:"consumed_storage_bytes"`
	Grants               []DataGrant `json:"grants"`
}

// UpsertDataGrantRequest is used to create or update a storage grant
type UpsertDataGrantRequest struct {
	Source       string     `json:"source"`
	StorageBytes int64      `json:"storage_bytes"`
	Description  string     `json:"description,omitempty"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
}
// AdminOutdatedInstance is an instance that is not on the latest parser version.
type AdminOutdatedInstance struct {
	ID             uuid.UUID `json:"id"`
	LogGroupID     uuid.UUID `json:"log_group_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	ParserVersion  string    `json:"parser_version"`
	RealmName      string    `json:"realm_name"`
	UploaderName   string    `json:"uploader_name"`
	UploadedAt     time.Time `json:"uploaded_at"`
	ElapsedSeconds *float64  `json:"elapsed_seconds"`
}

// AdminOutdatedInstancesResponse is the response for listing instances with outdated parser versions.
type AdminOutdatedInstancesResponse struct {
	Instances  []AdminOutdatedInstance `json:"instances"`
	MinVersion string                  `json:"min_version"`
}
type SiteConfig struct {
	SignupsEnabled bool `json:"signups_enabled"`
}


