package serviceinference

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/secrets"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/openrouter"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
)

const credentialKeyID = "v1"

var _ services.Servicer = (*Service)(nil)
var _ http.Handler = (*Service)(nil)

type Service struct {
	broker                     *services.Services
	credentialKey              string
	openRouterBaseURL          string
	openRouterAuthorizationURL string
	attributionTitle           string
	attributionReferer         string

	logger     *slog.Logger
	db         database.Store
	zed        *authz.Authz
	accessURL  *url.URL
	cipher     *secrets.CredentialCipher
	registry   *Registry
	openRouter *openrouter.Client
	router     http.Handler
	enabled    bool
}

func New(broker *services.Services) *Service       { return &Service{broker: broker} }
func Inference(broker *services.Services) *Service { return services.MustGet[*Service](broker) }
func OnInference() string                          { return (&Service{}).Name() }
func (s *Service) Name() string                    { return services.ServiceInference }
func (s *Service) Configures() []string            { return nil }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), servicedbstore.OnDatabaseStore(), serviceauthz.OnAuthz(), serviceaccessurl.OnAccessURL()}
}
func (s *Service) Enabled() bool                                    { return s.enabled }
func (s *Service) Routes() http.Handler                             { return s }
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.router.ServeHTTP(w, r) }
func (s *Service) Close(context.Context) error                      { return nil }

func (s *Service) Start(ctx context.Context) error {
	s.logger = servicelogger.Logger(s.broker)
	s.db = servicedbstore.DatabaseStore(s.broker)
	s.zed = serviceauthz.Authz(s.broker)
	accessURL, err := url.Parse(serviceaccessurl.AccessURL(s.broker))
	if err != nil {
		return fmt.Errorf("parse inference access URL: %w", err)
	}
	s.accessURL = accessURL
	s.router = s.routes()
	if strings.TrimSpace(s.credentialKey) == "" {
		s.enabled = false
		return nil
	}
	s.cipher, err = credentialCipher(s.credentialKey)
	if err != nil {
		return err
	}
	title := strings.TrimSpace(s.attributionTitle)
	if title == "" {
		title = "Chronicle"
	}
	referer := strings.TrimSpace(s.attributionReferer)
	if referer == "" {
		referer = accessURL.String()
	}
	s.openRouter, err = openrouter.New(openrouter.Config{BaseURL: s.openRouterBaseURL, AuthorizationURL: s.openRouterAuthorizationURL, AttributionReferer: referer, AttributionTitle: title})
	if err != nil {
		return err
	}
	s.registry = NewRegistry()
	if err := s.registry.Register(s.openRouter); err != nil {
		return err
	}
	expired, err := s.db.ExpireStaleInferenceRuns(ctx)
	if err != nil {
		return fmt.Errorf("expire stale inference runs: %w", err)
	}
	if expired > 0 {
		s.logger.Warn("expired stale inference runs", "count", expired)
	}
	s.enabled = true
	return nil
}

func credentialCipher(encoded string) (*secrets.CredentialCipher, error) {
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode inference credential encryption key: %w", err)
	}
	cipher, err := secrets.NewCredentialCipher(credentialKeyID, key)
	if err != nil {
		return nil, fmt.Errorf("configure inference credential encryption: %w", err)
	}
	return cipher, nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{Name: "Inference credential encryption key", Description: "Base64 encoded 32-byte AES key for inference credentials.", Flag: "inference-credential-encryption-key", Env: "CHRONICLE_INFERENCE_CREDENTIAL_ENCRYPTION_KEY", Default: "", Value: serpent.StringOf(&s.credentialKey)},
		{Name: "OpenRouter base URL", Description: "OpenRouter API base URL.", Flag: "inference-openrouter-base-url", Env: "CHRONICLE_INFERENCE_OPENROUTER_BASE_URL", Default: openrouter.DefaultBaseURL, Value: serpent.StringOf(&s.openRouterBaseURL)},
		{Name: "OpenRouter authorization URL", Description: "OpenRouter OAuth authorization URL.", Flag: "inference-openrouter-auth-url", Env: "CHRONICLE_INFERENCE_OPENROUTER_AUTH_URL", Default: openrouter.DefaultAuthorizationBaseURL, Value: serpent.StringOf(&s.openRouterAuthorizationURL)},
		{Name: "Inference attribution title", Description: "Provider attribution title.", Flag: "inference-attribution-title", Env: "CHRONICLE_INFERENCE_ATTRIBUTION_TITLE", Default: "Chronicle", Value: serpent.StringOf(&s.attributionTitle)},
		{Name: "Inference attribution referer", Description: "Provider attribution referer; defaults to access URL.", Flag: "inference-attribution-referer", Env: "CHRONICLE_INFERENCE_ATTRIBUTION_REFERER", Default: "", Value: serpent.StringOf(&s.attributionReferer)},
	}
}

func credentialAAD(userID, purpose string) []byte { return []byte(userID + ":" + purpose) }
func hashSecret(value string) []byte              { sum := sha256.Sum256([]byte(value)); return sum[:] }
