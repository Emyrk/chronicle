package chroniclesdk

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const SidekickOnlineThreshold = 3 * time.Minute

const SidekickConfigVersion = 1

type SidekickConfig struct {
	Version    int                      `json:"version"`
	AutoUpload SidekickAutoUploadConfig `json:"auto_upload"`
}

type SidekickAutoUploadConfig struct {
	Enabled bool `json:"enabled"`
}

func DefaultSidekickConfig() SidekickConfig {
	return SidekickConfig{
		Version: SidekickConfigVersion,
		AutoUpload: SidekickAutoUploadConfig{
			Enabled: false,
		},
	}
}

func (c SidekickConfig) Validate() error {
	if c.Version != SidekickConfigVersion {
		return fmt.Errorf("unsupported Sidekick config version %d", c.Version)
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
	Inherited     bool            `json:"inherited"`
	Override      *SidekickConfig `json:"override,omitempty"`
	Effective     SidekickConfig  `json:"effective"`
	EffectiveHash string          `json:"effective_hash"`
}

type SidekickAccountConfigResponse struct {
	Config SidekickConfig `json:"config"`
	Hash   string         `json:"hash"`
}

type SidekickStatusResponse struct {
	SidekickInstallation
	ConfigHash string          `json:"config_hash"`
	Config     *SidekickConfig `json:"config,omitempty"`
}

type SidekickInstallation struct {
	ID             uuid.UUID              `json:"id"`
	Name           string                 `json:"name"`
	Platform       string                 `json:"platform,omitempty"`
	Version        string                 `json:"version,omitempty"`
	Online         bool                   `json:"online"`
	LastSeenAt     *time.Time             `json:"last_seen_at,omitempty"`
	LastUploadAt   *time.Time             `json:"last_upload_at,omitempty"`
	DisconnectedAt *time.Time             `json:"disconnected_at,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	WoWDirectories []SidekickWoWDirectory `json:"wow_directories"`
	Issues         []SidekickIssue        `json:"issues"`
	Configuration  *SidekickConfigState   `json:"configuration,omitempty"`
}

type SidekickWoWDirectory struct {
	Path          string `json:"path"`
	TenantName    string `json:"tenant_name"`
	TenantBaseURL string `json:"tenant_base_url"`
	Realmlist     string `json:"realmlist,omitempty"`
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
	AccountConfig SidekickAccountConfigResponse `json:"account_config"`
	Sidekicks     []SidekickInstallation        `json:"sidekicks"`
}

type RenameSidekickRequest struct {
	Name string `json:"name"`
}

type SidekickStatusRequest struct {
	Platform       string                 `json:"platform,omitempty"`
	Version        string                 `json:"version,omitempty"`
	ConfigHash     string                 `json:"config_hash,omitempty"`
	WoWDirectories []SidekickWoWDirectory `json:"wow_directories"`
	Issues         []SidekickIssueReport  `json:"issues"`
}

type SidekickIssueReport struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}
