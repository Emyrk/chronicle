package chroniclesdk

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
)

const SidekickOnlineThreshold = 3 * time.Minute

const SidekickConfigVersion = 1

const (
	SidekickArchiveRetentionDaysDefault = 7
	SidekickArchiveRetentionDaysMin     = 1
	SidekickArchiveRetentionDaysMax     = 365
)

const (
	SidekickLogFormat112aCcAddon       SidekickLogFormat = "1.12a-cc-addon"
	SidekickLogFormat335aCcAddon       SidekickLogFormat = "3.3.5a-cc-addon"
	SidekickLogFormat243CcAddon        SidekickLogFormat = "2.4.3-cc-addon"
	SidekickLogFormatHermesproxy1142Cc SidekickLogFormat = "hermesproxy_1_14_2_cc"

	SidekickAutoUploadDisabled   SidekickAutoUploadMode = "disabled"
	SidekickAutoUploadOnGameExit SidekickAutoUploadMode = "on_game_exit"
)

var sidekickWoWDirectoryIDPattern = regexp.MustCompile(`^wowdir_[0-9a-f]{64}$`)

func IsValidSidekickWoWDirectoryID(id string) bool {
	return sidekickWoWDirectoryIDPattern.MatchString(id)
}

type SidekickLogFormat string

func (f SidekickLogFormat) Valid() bool {
	switch f {
	case SidekickLogFormat112aCcAddon,
		SidekickLogFormat335aCcAddon,
		SidekickLogFormat243CcAddon,
		SidekickLogFormatHermesproxy1142Cc:
		return true
	default:
		return false
	}
}

type SidekickAutoUploadMode string

type SidekickDirectoryConfig struct {
	AutoUpload SidekickAutoUploadMode `json:"auto_upload"`
}

type SidekickArchiveConfig struct {
	Enabled       bool `json:"enabled"`
	RetentionDays int  `json:"retention_days"`
}

type SidekickConfig struct {
	Version        int                                `json:"version"`
	Archive        SidekickArchiveConfig              `json:"archive"`
	WoWDirectories map[string]SidekickDirectoryConfig `json:"wow_directories"`
}

func DefaultSidekickConfig() SidekickConfig {
	return SidekickConfig{
		Version: SidekickConfigVersion,
		Archive: SidekickArchiveConfig{
			Enabled:       true,
			RetentionDays: SidekickArchiveRetentionDaysDefault,
		},
		WoWDirectories: map[string]SidekickDirectoryConfig{},
	}
}

func (c SidekickConfig) Validate() error {
	if c.Version != SidekickConfigVersion {
		return fmt.Errorf("unsupported Sidekick config version %d", c.Version)
	}
	if c.Archive.RetentionDays < SidekickArchiveRetentionDaysMin || c.Archive.RetentionDays > SidekickArchiveRetentionDaysMax {
		return fmt.Errorf("archive retention_days must be between %d and %d", SidekickArchiveRetentionDaysMin, SidekickArchiveRetentionDaysMax)
	}
	if c.WoWDirectories == nil {
		return fmt.Errorf("wow_directories must be an object")
	}
	for id, directory := range c.WoWDirectories {
		if !sidekickWoWDirectoryIDPattern.MatchString(id) {
			return fmt.Errorf("invalid World of Warcraft directory ID %q", id)
		}
		switch directory.AutoUpload {
		case SidekickAutoUploadDisabled, SidekickAutoUploadOnGameExit:
		default:
			return fmt.Errorf("unsupported auto-upload mode %q", directory.AutoUpload)
		}
	}
	return nil
}

func (c SidekickConfig) CanonicalJSON() ([]byte, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return json.Marshal(c)
}

func (c SidekickConfig) Hash() (string, error) {
	payload, err := c.CanonicalJSON()
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(payload)
	return hex.EncodeToString(hash[:]), nil
}

type SidekickConfigState struct {
	Config SidekickConfig `json:"config"`
	Hash   string         `json:"hash"`
}

type SidekickStatusResponse struct {
	SettingsURL string          `json:"settings_url"`
	ConfigHash  string          `json:"config_hash"`
	Config      *SidekickConfig `json:"config,omitempty"`
}

type SidekickAutoUploadCapabilities map[SidekickLogFormat][]SidekickAutoUploadMode

type SidekickInstallation struct {
	ID                     uuid.UUID                      `json:"id"`
	Name                   string                         `json:"name"`
	Platform               string                         `json:"platform,omitempty"`
	SidekickVersion        string                         `json:"sidekick_version,omitempty"`
	StartAtLogin           bool                           `json:"start_at_login"`
	AutoUploadCapabilities SidekickAutoUploadCapabilities `json:"auto_upload_capabilities"`
	Online                 bool                           `json:"online"`
	LastSeenAt             *time.Time                     `json:"last_seen_at,omitempty"`
	LastUploadAt           *time.Time                     `json:"last_upload_at,omitempty"`
	DisconnectedAt         *time.Time                     `json:"disconnected_at,omitempty"`
	CreatedAt              time.Time                      `json:"created_at"`
	WoWDirectories         []SidekickWoWDirectory         `json:"wow_directories"`
	Issues                 []SidekickIssue                `json:"issues"`
	Configuration          *SidekickConfigState           `json:"configuration,omitempty"`
}

type SidekickInspectionStatus string

type SidekickInspectionCategory string

type SidekickInspectionCheckStatus string

const (
	SidekickInspectionReady          SidekickInspectionStatus = "ready"
	SidekickInspectionActionRequired SidekickInspectionStatus = "action_required"
	SidekickInspectionUnknown        SidekickInspectionStatus = "unknown"

	SidekickInspectionAddon SidekickInspectionCategory = "addon"
	SidekickInspectionDLL   SidekickInspectionCategory = "dll"

	SidekickInspectionPresent SidekickInspectionCheckStatus = "present"
	SidekickInspectionMissing SidekickInspectionCheckStatus = "missing"
)

type SidekickInspectionCheck struct {
	ID       string                        `json:"id"`
	Category SidekickInspectionCategory    `json:"category"`
	Name     string                        `json:"name"`
	Required bool                          `json:"required"`
	Status   SidekickInspectionCheckStatus `json:"status"`
}

type SidekickInspection struct {
	Status SidekickInspectionStatus  `json:"status"`
	Checks []SidekickInspectionCheck `json:"checks"`
}

func (i SidekickInspection) Validate() error {
	switch i.Status {
	case SidekickInspectionReady, SidekickInspectionActionRequired, SidekickInspectionUnknown:
	default:
		return fmt.Errorf("unsupported inspection status %q", i.Status)
	}
	if i.Checks == nil {
		return fmt.Errorf("inspection checks must be an array")
	}
	if len(i.Checks) > 20 {
		return fmt.Errorf("inspection has too many checks")
	}
	seen := make(map[string]struct{}, len(i.Checks))
	for _, check := range i.Checks {
		if check.ID == "" || len(check.ID) > 100 || check.Name == "" || len(check.Name) > 200 {
			return fmt.Errorf("inspection check is invalid")
		}
		switch check.Category {
		case SidekickInspectionAddon, SidekickInspectionDLL:
		default:
			return fmt.Errorf("unsupported inspection category %q", check.Category)
		}
		switch check.Status {
		case SidekickInspectionPresent, SidekickInspectionMissing:
		default:
			return fmt.Errorf("unsupported inspection check status %q", check.Status)
		}
		if _, ok := seen[check.ID]; ok {
			return fmt.Errorf("inspection check IDs must be unique")
		}
		seen[check.ID] = struct{}{}
	}
	return nil
}

type SidekickWoWDirectory struct {
	ID            string             `json:"id"`
	Path          string             `json:"path"`
	TenantName    string             `json:"tenant_name,omitempty"`
	TenantBaseURL string             `json:"tenant_base_url,omitempty"`
	Realmlist     string             `json:"realmlist,omitempty"`
	LogFormat     SidekickLogFormat  `json:"log_format,omitempty"`
	Inspection    SidekickInspection `json:"inspection"`
}

type SidekickIssue struct {
	ID              uuid.UUID  `json:"id"`
	Code            string     `json:"code"`
	Message         string     `json:"message"`
	Details         string     `json:"details,omitempty"`
	FirstReportedAt time.Time  `json:"first_reported_at"`
	LastReportedAt  time.Time  `json:"last_reported_at"`
	ResolvedAt      *time.Time `json:"resolved_at,omitempty"`
}

type ListSidekicksResponse struct {
	Sidekicks []SidekickInstallation `json:"sidekicks"`
}

type RenameSidekickRequest struct {
	Name string `json:"name"`
}

type SidekickStatusRequest struct {
	Platform               string                         `json:"platform,omitempty"`
	SidekickVersion        string                         `json:"sidekick_version,omitempty"`
	ConfigHash             string                         `json:"config_hash,omitempty"`
	StartAtLogin           *bool                          `json:"start_at_login"`
	AutoUploadCapabilities SidekickAutoUploadCapabilities `json:"auto_upload_capabilities"`
	WoWDirectories         []SidekickWoWDirectory         `json:"wow_directories"`
	Issues                 []SidekickIssueReport          `json:"issues"`
}

type SidekickIssueReport struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}
