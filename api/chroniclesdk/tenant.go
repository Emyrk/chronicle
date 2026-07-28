package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Tenant is the SDK type exposed to the frontend.
type Tenant struct {
	ID                  uuid.UUID  `json:"id"`
	Slug                *string    `json:"slug"`
	Name                string     `json:"name"`
	DisableClientUpload bool       `json:"disable_client_upload"`
	IncludeInAll        bool       `json:"include_in_all"`
	Discoverable        bool       `json:"discoverable"`
	Branding            *Branding    `json:"branding"`
	ParseConfig         *ParseConfig `json:"parse_config"`
	DefaultDatasetID    *uuid.UUID   `json:"default_dataset_id"`
	// DefaultFormat is the tenant's preferred log parse format (e.g.
	// "1.12a-cc-addon"). Nil means no preference — the frontend falls back
	// to the compiled-in server default.
	DefaultFormat *string `json:"default_format"`
	// AvailableFormats restricts which log formats are valid for this tenant.
	// Empty means all formats are available.
	AvailableFormats []string `json:"available_formats"`
	// ExternalVerification is the tenant's external verification provider
	// config. The secret is always stripped on reads.
	ExternalVerification *ExternalVerification `json:"external_verification,omitempty"`
	CreatedAt            time.Time             `json:"created_at"`
	UpdatedAt            time.Time             `json:"updated_at"`
}

// ParseConfig holds tenant-level parse scoring settings, stored as JSONB.
type ParseConfig struct {
	// CohortMode controls the parse scoring mode: "spec" (default), "class",
	// or "disabled". When disabled, no snapshots are created and the instance
	// parses endpoint returns available=false.
	CohortMode string `json:"cohort_mode,omitempty"`
	// DefaultLookbackDays is the default lookback window (60 = last 60 days; 0 = all-time).
	DefaultLookbackDays int `json:"default_lookback_days,omitempty"`
	// AllowedLookbackDays lists the selectable lookback windows.
	AllowedLookbackDays []int `json:"allowed_lookback_days,omitempty"`
	// EnabledMetrics lists active metric names (e.g. "dps", "hps").
	EnabledMetrics []string `json:"enabled_metrics,omitempty"`
	// SnapshotCadence is the publication interval description (e.g. "6h", "daily").
	SnapshotCadence string `json:"snapshot_cadence,omitempty"`
}

// Branding holds the visual identity for a tenant subdomain or the primary domain.
type Branding struct {
	SquareLogo       string   `json:"square_logo,omitempty"`
	LogoWide         string   `json:"logo_wide,omitempty"`
	Favicon          string   `json:"favicon,omitempty"`
	DisplayName      string   `json:"display_name,omitempty"`
	Tagline          string   `json:"tagline,omitempty"`
	Description      string   `json:"description,omitempty"`
	BackgroundBanner string   `json:"background_banner,omitempty"`
	Tags  []string          `json:"tags,omitempty"`
	Theme map[string]string `json:"theme,omitempty"` // CSS color overrides keyed by knob name (hex "#RRGGBB")
}

// TenantFromDB converts a database.Tenant to the SDK type.
func TenantFromDB(t database.Tenant) Tenant {
	out := Tenant{
		ID:                  t.ID,
		Name:                t.Name,
		DisableClientUpload: t.DisableClientUpload,
		IncludeInAll:        t.IncludeInAll,
		Discoverable:        t.Discoverable,
		CreatedAt:           t.CreatedAt.Time,
		UpdatedAt:           t.UpdatedAt.Time,
	}
	if t.Slug.Valid {
		out.Slug = &t.Slug.String
	}
	if len(t.Branding) > 0 {
		var b Branding
		if err := json.Unmarshal(t.Branding, &b); err == nil {
			out.Branding = &b
		}
	}
	if len(t.ParseConfig) > 0 {
		var pc ParseConfig
		if err := json.Unmarshal(t.ParseConfig, &pc); err == nil {
			out.ParseConfig = &pc
		}
	}
	if ev := ParseExternalVerification(t.ExternalVerification); ev != nil {
		// Never expose the provider secret on reads.
		ev.Secret = ""
		out.ExternalVerification = ev
	}
	if t.DefaultDatasetID.Valid {
		out.DefaultDatasetID = &t.DefaultDatasetID.UUID
	}
	if t.DefaultFormat.Valid {
		s := string(t.DefaultFormat.LogFormat)
		out.DefaultFormat = &s
	}
	if len(t.AvailableFormats) > 0 {
		out.AvailableFormats = t.AvailableFormats
	}
	return out
}

// ParseExternalVerification unmarshals a tenant's raw external_verification
// JSONB column. Returns nil when unset, null, or invalid. The result includes
// the secret; strip it before returning data to clients.
func ParseExternalVerification(data []byte) *ExternalVerification {
	if len(data) == 0 {
		return nil
	}
	var ev ExternalVerification
	if err := json.Unmarshal(data, &ev); err != nil || ev.URL == "" {
		return nil
	}
	return &ev
}

// ExternalVerification configures an external verification provider for a
// tenant. Providers verify players out-of-band (e.g. via Discord) and expose
// an API Chronicle can use to link characters to accounts.
type ExternalVerification struct {
	// Type of provider. Currently only "zug-zug".
	Type string `json:"type"`
	// URL is the provider's base URL, e.g. "https://ambershire.com".
	URL string `json:"url"`
	// Secret is the bearer token for the provider API. Write-only: it is
	// stripped from all read responses.
	Secret string `json:"secret,omitempty"`
	// InstructionsURL optionally points players at how to get verified.
	InstructionsURL string `json:"instructions_url,omitempty"`
}

// Public returns the provider info safe to expose to any visitor.
func (e *ExternalVerification) Public() *ExternalVerificationPublic {
	if e == nil {
		return nil
	}
	return &ExternalVerificationPublic{
		Type:            e.Type,
		InstructionsURL: e.InstructionsURL,
	}
}

// ExternalVerificationPublic is the subset of ExternalVerification exposed
// in the site config.
type ExternalVerificationPublic struct {
	Type            string `json:"type"`
	InstructionsURL string `json:"instructions_url,omitempty"`
}

// SetServerTenantRequest assigns or removes a tenant from a server.
// Pass null tenant_id to remove the assignment.
type SetServerTenantRequest struct {
	TenantID *uuid.UUID `json:"tenant_id"`
}

// SetDatasetRequest assigns or removes a default dataset from a server or
// tenant. Pass null dataset_id to remove the assignment (resolution then falls
// back to the next level in the chain, ultimately the default dataset).
type SetDatasetRequest struct {
	DatasetID *uuid.UUID `json:"dataset_id"`
}

// UpsertTenantRequest is the request body for creating or updating a tenant.
// UpsertTenantRequest is the request body for creating or updating a tenant.
// Pointer fields are optional — if nil on update, no change occurs (COALESCE
// preserves the existing value).
type UpsertTenantRequest struct {
	ID                  uuid.NullUUID `json:"id"`
	Slug                *string       `json:"slug"`
	Name                string        `json:"name"`
	DisableClientUpload *bool         `json:"disable_client_upload"`
	IncludeInAll        *bool         `json:"include_in_all"`
	Discoverable        *bool         `json:"discoverable"`
	Branding            *Branding     `json:"branding"`
	ParseConfig         *ParseConfig  `json:"parse_config"`
	DefaultFormat    *string  `json:"default_format"`
	AvailableFormats []string `json:"available_formats"`
	// ExternalVerification updates the tenant's external verification
	// provider. Omit to keep the existing config; send with an empty URL to
	// disable.
	ExternalVerification *ExternalVerification `json:"external_verification"`
}

// IsCreate returns true when the request should insert a new tenant.
func (r UpsertTenantRequest) IsCreate() bool {
	return !r.ID.Valid || r.ID.UUID == uuid.Nil
}

func (r UpsertTenantRequest) marshalBranding() []byte {
	if r.Branding == nil {
		return nil
	}
	b, _ := json.Marshal(r.Branding)
	return b
}

func (r UpsertTenantRequest) marshalParseConfig() []byte {
	if r.ParseConfig == nil {
		return nil
	}
	b, _ := json.Marshal(r.ParseConfig)
	return b
}

func (r UpsertTenantRequest) marshalExternalVerification() []byte {
	if r.ExternalVerification == nil {
		return nil
	}
	if r.ExternalVerification.URL == "" {
		// Explicitly disable: store JSON null (non-nil so COALESCE applies).
		return []byte("null")
	}
	b, _ := json.Marshal(r.ExternalVerification)
	return b
}

// ToInsertParams converts the request for a new tenant.
func (r UpsertTenantRequest) ToInsertParams() database.InsertTenantParams {
	id := r.ID.UUID
	if id == uuid.Nil {
		id = uuid.New()
	}

	var slug pgtype.Text
	if r.Slug != nil {
		slug = pgtype.Text{String: *r.Slug, Valid: true}
	}

	disableUpload := false
	if r.DisableClientUpload != nil {
		disableUpload = *r.DisableClientUpload
	}

	includeInAll := true
	if r.IncludeInAll != nil {
		includeInAll = *r.IncludeInAll
	}

	discoverable := false
	if r.Discoverable != nil {
		discoverable = *r.Discoverable
	}

	var defaultFormat database.NullLogFormat
	if r.DefaultFormat != nil {
		defaultFormat = database.NullLogFormat{LogFormat: database.LogFormat(*r.DefaultFormat), Valid: true}
	}

	return database.InsertTenantParams{
		ID:                   id,
		Slug:                 slug,
		Name:                 r.Name,
		DisableClientUpload:  disableUpload,
		IncludeInAll:         includeInAll,
		Discoverable:         discoverable,
		ExternalVerification: r.marshalExternalVerification(),
		Branding:            r.marshalBranding(),
		ParseConfig:         r.marshalParseConfig(),
		DefaultFormat:    defaultFormat,
		AvailableFormats: r.AvailableFormats,
	}
}

// ToUpdateParams converts the request for an existing tenant.
// Nil fields produce NULL → COALESCE keeps the existing value.
func (r UpsertTenantRequest) ToUpdateParams() database.UpdateTenantParams {
	var slug pgtype.Text
	if r.Slug != nil {
		slug = pgtype.Text{String: *r.Slug, Valid: true}
	}

	var name pgtype.Text
	if r.Name != "" {
		name = pgtype.Text{String: r.Name, Valid: true}
	}

	var disableUpload pgtype.Bool
	if r.DisableClientUpload != nil {
		disableUpload = pgtype.Bool{Bool: *r.DisableClientUpload, Valid: true}
	}

	var includeInAll pgtype.Bool
	if r.IncludeInAll != nil {
		includeInAll = pgtype.Bool{Bool: *r.IncludeInAll, Valid: true}
	}

	var discoverable pgtype.Bool
	if r.Discoverable != nil {
		discoverable = pgtype.Bool{Bool: *r.Discoverable, Valid: true}
	}

	var defaultFormat database.NullLogFormat
	if r.DefaultFormat != nil {
		defaultFormat = database.NullLogFormat{LogFormat: database.LogFormat(*r.DefaultFormat), Valid: true}
	}

	return database.UpdateTenantParams{
		ID:                   r.ID.UUID,
		Slug:                 slug,
		Name:                 name,
		DisableClientUpload:  disableUpload,
		IncludeInAll:         includeInAll,
		Discoverable:         discoverable,
		ExternalVerification: r.marshalExternalVerification(),
		Branding:            r.marshalBranding(),
		ParseConfig:         r.marshalParseConfig(),
		DefaultFormat:    defaultFormat,
		AvailableFormats: r.AvailableFormats,
	}
}
