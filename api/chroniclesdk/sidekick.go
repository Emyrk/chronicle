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
	SidekickGameFormatWotLK335a SidekickGameFormat = "wotlk_3.3.5a"

	SidekickAutoUploadDisabled   SidekickAutoUploadMode = "disabled"
	SidekickAutoUploadOnGameExit SidekickAutoUploadMode = "on_game_exit"
)

var sidekickWoWDirectoryIDPattern = regexp.MustCompile(`^wowdir_[0-9a-f]{64}$`)

func IsValidSidekickWoWDirectoryID(id string) bool {
	return sidekickWoWDirectoryIDPattern.MatchString(id)
}

type SidekickGameFormat string

type SidekickAutoUploadMode string

type SidekickDirectoryConfig struct {
	GameFormat SidekickGameFormat     `json:"game_format"`
	AutoUpload SidekickAutoUploadMode `json:"auto_upload"`
}

type SidekickConfig struct {
	Version        int                                `json:"version"`
	WoWDirectories map[string]SidekickDirectoryConfig `json:"wow_directories"`
}

func DefaultSidekickConfig() SidekickConfig {
	return SidekickConfig{
		Version:        SidekickConfigVersion,
		WoWDirectories: map[string]SidekickDirectoryConfig{},
	}
}

func (c SidekickConfig) Validate() error {
	if c.Version != SidekickConfigVersion {
		return fmt.Errorf("unsupported Sidekick config version %d", c.Version)
	}
	if c.WoWDirectories == nil {
		return fmt.Errorf("wow_directories must be an object")
	}
	for id, directory := range c.WoWDirectories {
		if !sidekickWoWDirectoryIDPattern.MatchString(id) {
			return fmt.Errorf("invalid World of Warcraft directory ID %q", id)
		}
		if directory.GameFormat != SidekickGameFormatWotLK335a {
			return fmt.Errorf("unsupported game format %q", directory.GameFormat)
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
	ConfigHash string          `json:"config_hash"`
	Config     *SidekickConfig `json:"config,omitempty"`
}

type SidekickAutoUploadCapabilities map[SidekickGameFormat][]SidekickAutoUploadMode

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

type SidekickWoWDirectory struct {
	ID            string             `json:"id"`
	Path          string             `json:"path"`
	TenantName    string             `json:"tenant_name,omitempty"`
	TenantBaseURL string             `json:"tenant_base_url,omitempty"`
	Realmlist     string             `json:"realmlist,omitempty"`
	GameFormat    SidekickGameFormat `json:"game_format,omitempty"`
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
