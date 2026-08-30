package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// TokenDumpResponse carries the caller's raw session JWT for CLI use.
type TokenDumpResponse struct {
	Token string `json:"token"`
}

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
	// CreatedAt is when the user's account was created.
	CreatedAt time.Time `json:"created_at"`
}

type Preferences struct {
	HelpfulHints bool `json:"helpful_hints"`
	// RawLogRetentionHours is how long to keep raw log files in object storage
	// after upload. nil means keep forever.
	RawLogRetentionHours *int32 `json:"raw_log_retention_hours"`
}

// UpdatePreferencesRequest is the request body for updating user preferences.
type UpdatePreferencesRequest struct {
	// RawLogRetentionHours controls raw log file retention. nil = no change, 0 = keep forever.
	RawLogRetentionHours *int32 `json:"raw_log_retention_hours"`
}

type User struct {
	ID                     uuid.UUID `json:"id"`
	Username               string    `json:"username"`
	Email                  string    `json:"email"`
	DiscordID              string    `json:"discord_id,omitempty"`
	Roles                  []string  `json:"roles"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
	MaxStorageBytes        int64     `json:"max_storage_bytes"`
	MaxStorageBytesUpdated time.Time `json:"max_storage_bytes_updated"`
	ConsumedStorageBytes   int64     `json:"consumed_storage_bytes"`
	// RawLogRetentionHours is how long to keep raw log files. nil means keep forever.
	RawLogRetentionHours *int32 `json:"raw_log_retention_hours"`
}

// AdminSetUserRetentionRequest is the request body for setting a user's raw log retention.
type AdminSetUserRetentionRequest struct {
	// RawLogRetentionHours is the number of hours to retain raw log files.
	// 0 means keep forever (sets NULL in DB).
	RawLogRetentionHours int32 `json:"raw_log_retention_hours"`
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

type AdminBulkLogRequest struct {
	LogIDs []uuid.UUID `json:"log_ids"`
}

type AdminBulkLogFailure struct {
	LogGroupID uuid.UUID `json:"log_group_id"`
	Detail     string    `json:"detail"`
}

type AdminBulkDeleteResponse struct {
	Requested int                   `json:"requested"`
	Deleted   int                   `json:"deleted"`
	Failed    []AdminBulkLogFailure `json:"failed"`
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

type AdminBulkSelectedReparseResponse struct {
	Requested int                   `json:"requested"`
	Enqueued  int                   `json:"enqueued"`
	Failed    []AdminBulkLogFailure `json:"failed"`
}

type AdminBulkReparseFailure struct {
	LogGroupID uuid.UUID `json:"log_group_id"`
	Name       string    `json:"name"`
	Detail     string    `json:"detail"`
}

type AdminBulkReparseResponse struct {
	Matched    int                       `json:"matched"`
	Enqueued   int                       `json:"enqueued"`
	MinVersion string                    `json:"min_version"`
	Failed     []AdminBulkReparseFailure `json:"failed"`
}

type SiteConfig struct {
	SignupsEnabled  bool   `json:"signups_enabled"`
	ShortLinkDomain string `json:"short_link_domain,omitempty"`
	// ClientUploadsDisabled indicates that this server uses server-side logging
	// and client-side uploads should be hidden from the UI.
	ClientUploadsDisabled bool `json:"client_uploads_disabled"`
	// Tenant is the resolved tenant for the current request (based on subdomain).
	// Nil when accessed from the root domain.
	Tenant *Tenant `json:"tenant"`
	// PrimaryDomain is the root domain for building cross-tenant URLs.
	PrimaryDomain string `json:"primary_domain,omitempty"`
	// AccessURL is the main domain URL used for OAuth redirects.
	// On tenant subdomains the frontend redirects OAuth to this origin.
	AccessURL string `json:"access_url,omitempty"`
	// Branding is the visual identity for the primary domain.
	// On tenant subdomains, use Tenant.Branding instead.
	Branding *Branding `json:"branding"`
	// Discoverable controls whether this deployment appears in /api/v1/discovery.
	Discoverable bool `json:"discoverable"`
	// DefaultFormat is the primary domain's preferred log parse format.
	// Nil means no preference — fall back to the compiled-in server default.
	DefaultFormat *string `json:"default_format"`
	// AvailableFormats restricts which log formats are valid on the primary
	// domain. Empty means all formats are available.
	AvailableFormats []string `json:"available_formats"`
	// DatasetFlavor contains the default_flavor tags from the resolved
	// dataset for this tenant. The frontend uses these to derive per-flavor
	// settings such as the talent calculator's max level.
	DatasetFlavor []string `json:"dataset_flavor"`
	// ExternalVerification advertises the tenant's external character
	// verification provider (never includes the URL or secret).
	ExternalVerification *ExternalVerificationPublic `json:"external_verification,omitempty"`
}

// UpdateSiteConfigRequest allows partial updates to site configuration.
// Only non-nil fields will be updated.
type UpdateSiteConfigRequest struct {
	SignupsEnabled      *bool     `json:"signups_enabled,omitempty"`
	DisableClientUpload *bool     `json:"disable_client_upload,omitempty"`
	Branding            *Branding `json:"branding,omitempty"`
	Discoverable        *bool     `json:"discoverable,omitempty"`
	DefaultFormat       *string   `json:"default_format,omitempty"`
	AvailableFormats    []string  `json:"available_formats,omitempty"`
}

// SetUserRolesRequest is the request body for setting a user's Chronicle roles.
type SetUserRolesRequest struct {
	Roles []string `json:"roles"`
}
