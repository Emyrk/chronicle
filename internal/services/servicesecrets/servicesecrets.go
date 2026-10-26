// Package servicesecrets owns the shared cipher used to encrypt per-user
// third-party credentials, including inference providers and wow-logs tokens.
package servicesecrets

import (
	"context"
	"strings"

	"github.com/Emyrk/chronicle/internal/secrets"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/coder/serpent"
)

// CredentialKeyID is embedded in every ciphertext. It must stay "v1" so
// credentials written before the key was shared keep decrypting.
const CredentialKeyID = "v1"

var _ services.Servicer = (*Service)(nil)

// CredentialCipher returns the shared credential cipher, or nil when no
// encryption key is configured. Features that store credentials must treat
// nil as disabled.
func CredentialCipher(broker *services.Services) *secrets.CredentialCipher {
	return services.MustGet[*Service](broker).cipher
}

func OnSecrets() string { return (&Service{}).Name() }

type Service struct {
	broker *services.Services

	credentialKey string
	// legacyInferenceKey is the pre-rename env var, kept so existing
	// deployments keep working until they switch.
	legacyInferenceKey string

	cipher *secrets.CredentialCipher
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string                  { return services.ServiceSecrets }
func (s *Service) Configures() []string          { return []string{} }
func (s *Service) DependsOn() []string           { return []string{} }
func (s *Service) Close(_ context.Context) error { return nil }

func (s *Service) Start(_ context.Context) error {
	key := strings.TrimSpace(s.credentialKey)
	if key == "" {
		key = strings.TrimSpace(s.legacyInferenceKey)
	}
	if key == "" {
		return nil
	}
	cipher, err := secrets.NewCredentialCipherFromBase64(CredentialKeyID, key)
	if err != nil {
		return err
	}
	s.cipher = cipher
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Credential encryption key",
			Description: "Base64 encoded 32-byte AES key used to encrypt user-provided third-party credentials.",
			Flag:        "credential-encryption-key",
			Env:         "CHRONICLE_CREDENTIAL_ENCRYPTION_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.credentialKey),
		},
		{
			Name:        "Inference credential encryption key (deprecated)",
			Description: "Deprecated: use CHRONICLE_CREDENTIAL_ENCRYPTION_KEY.",
			Flag:        "inference-credential-encryption-key",
			Env:         "CHRONICLE_INFERENCE_CREDENTIAL_ENCRYPTION_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.legacyInferenceKey),
			Hidden:      true,
		},
	}
}
