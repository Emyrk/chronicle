package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// APIKey is redacted metadata for a persistent CLI credential.
type APIKey struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type ListAPIKeysResponse struct {
	APIKeys []APIKey `json:"api_keys"`
}

type CreateAPIKeyRequest struct {
	Name string `json:"name"`
}

// CreateAPIKeyResponse contains a newly-created token. Token is returned only once.
type CreateAPIKeyResponse struct {
	APIKey APIKey `json:"api_key"`
	Token  string `json:"token"`
}
