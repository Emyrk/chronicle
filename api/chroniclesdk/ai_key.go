package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// AIKeyPrefix starts every AI key secret.
const AIKeyPrefix = "ck_"

// AIKeyQueryParam is the query parameter that carries an AI key on GET links.
const AIKeyQueryParam = "ai_key"

// AIKeyBenefits are what an AI key may do at one supporter tier.
type AIKeyBenefits struct {
	Tier string `json:"tier"`
	// LifetimeHours are the key lifetimes the owner may choose, shortest first.
	LifetimeHours []int `json:"lifetime_hours"`
	// ViewsPerMinute and ViewsPerDay cap the requests made with one key.
	ViewsPerMinute int `json:"views_per_minute"`
	ViewsPerDay    int `json:"views_per_day"`
	// ResultsPerSearch is the largest search page size.
	ResultsPerSearch int `json:"results_per_search"`
	// PrivateData is whether the owner may let the key read private data.
	PrivateData bool `json:"private_data"`
}

// AIKey describes a key without its secret.
type AIKey struct {
	ID            uuid.UUID  `json:"id" format:"uuid"`
	CreatedAt     time.Time  `json:"created_at" format:"date-time"`
	ExpiresAt     time.Time  `json:"expires_at" format:"date-time"`
	Expired       bool       `json:"expired"`
	PrivateData   bool       `json:"private_data"`
	LastUsedAt    *time.Time `json:"last_used_at,omitempty" format:"date-time"`
	LastUserAgent string     `json:"last_user_agent,omitempty"`
	RequestCount  int64      `json:"request_count"`
}

// AIKeyUsage is GET /me/ai-key: the current key (if any) and the caller's
// tier benefits.
type AIKeyUsage struct {
	Key *AIKey `json:"key,omitempty"`
	// ViewsRemainingToday is how many requests the key may still make today.
	ViewsRemainingToday int           `json:"views_remaining_today"`
	Benefits            AIKeyBenefits `json:"benefits"`
	// Tiers lists every tier's benefits, lowest first, for upgrade messages.
	Tiers []AIKeyBenefits `json:"tiers"`
}

// CreateAIKeyRequest picks the lifetime and private-data opt-in of a new key.
type CreateAIKeyRequest struct {
	// LifetimeHours must be one of the tier's options. Zero picks the default.
	LifetimeHours int  `json:"lifetime_hours,omitempty"`
	PrivateData   bool `json:"private_data,omitempty"`
}

// AIKeySecretResponse returns a key. Secret is set only when this request
// created the key; it is never shown again.
type AIKeySecretResponse struct {
	Key     AIKey  `json:"key"`
	Created bool   `json:"created"`
	Secret  string `json:"secret,omitempty"`
}
