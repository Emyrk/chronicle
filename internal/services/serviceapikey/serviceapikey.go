// Package serviceapikey owns persistent CLI credentials, including issuance,
// validation, revocation, permission checks, usage tracking, and rate limiting.
package serviceapikey

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/time/rate"
)

const (
	Prefix         = "chr_cli_"
	Provider       = "api_key"
	maxKeysPerUser = 10
)

var (
	ErrNotAuthorized = errors.New("API key not authorized")
	ErrRateLimited   = errors.New("API key rate limit exceeded")
	ErrReadOnly      = errors.New("API keys are read-only")
	ErrKeyLimit      = errors.New("API key limit reached")
	ErrInvalidName   = errors.New("token name must be between 1 and 80 characters")
)

type Identity struct {
	UserID uuid.UUID
	KeyID  uuid.UUID
}

type Service struct {
	broker *services.Services
	logger *slog.Logger
	zed    *authz.Authz

	requestsPerMinute int64
	burst             int64
	limiter           *keyLimiter
}

var _ services.Servicer = (*Service)(nil)

func New(broker *services.Services) *Service { return &Service{broker: broker} }
func OnAPIKey() string                       { return (&Service{}).Name() }
func APIKeyService(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}
func (s *Service) Name() string                { return services.ServiceAPIKey }
func (s *Service) Configures() []string        { return nil }
func (s *Service) Close(context.Context) error { return nil }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), serviceauthz.OnAuthz()}
}

func (s *Service) Start(context.Context) error {
	s.logger = services.NamedLogger(servicelogger.Logger(s.broker), s.Name())
	s.zed = serviceauthz.Authz(s.broker)
	s.limiter = newKeyLimiter(s.requestsPerMinute, s.burst)
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "API Key Requests Per Minute",
			Description: "Sustained per-token request rate. Set to 0 to disable API key rate limiting.",
			Required:    false,
			Flag:        "api-key-requests-per-minute",
			Env:         "CHRONICLE_API_KEY_REQUESTS_PER_MINUTE",
			Default:     "60",
			Value:       serpent.Int64Of(&s.requestsPerMinute),
		},
		{
			Name:        "API Key Burst",
			Description: "Maximum burst size for each API token. Set to 0 to disable API key rate limiting.",
			Required:    false,
			Flag:        "api-key-burst",
			Env:         "CHRONICLE_API_KEY_BURST",
			Default:     "20",
			Value:       serpent.Int64Of(&s.burst),
		},
	}
}

func IsToken(raw string) bool { return strings.HasPrefix(raw, Prefix) }

func (s *Service) Authenticate(ctx context.Context, raw, method string) (Identity, error) {
	key, err := s.zed.GetUserAPIKeyByHash(ctx, hash(raw))
	if errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, ErrNotAuthorized
	}
	if err != nil {
		return Identity{}, fmt.Errorf("look up API key: %w", err)
	}

	allowed, err := s.zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanCreate_api_key_User(policy.New().User(key.UserID)))
	if err != nil {
		return Identity{}, fmt.Errorf("check API access permission: %w", err)
	}
	if !allowed {
		return Identity{}, ErrNotAuthorized
	}
	if !isReadOnlyMethod(method) {
		return Identity{}, ErrReadOnly
	}
	if !s.limiter.allow(key.ID) {
		return Identity{}, ErrRateLimited
	}

	now := time.Now()
	if err := s.zed.TouchUserAPIKeyLastUsed(ctx, database.TouchUserAPIKeyLastUsedParams{
		LastUsedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		ID:             key.ID,
		LastUsedBefore: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true},
	}); err != nil {
		s.logger.Warn("failed to update API key last-used time", "api_key_id", key.ID, "error", err)
	}

	return Identity{UserID: key.UserID, KeyID: key.ID}, nil
}

func (s *Service) RetryAfterSeconds() int { return s.limiter.retryAfterSeconds() }

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]database.UserApiKey, error) {
	return s.zed.ListUserAPIKeys(ctx, userID)
}

func (s *Service) Create(ctx context.Context, userID uuid.UUID, name string) (database.UserApiKey, string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 80 {
		return database.UserApiKey{}, "", ErrInvalidName
	}

	count, err := s.zed.CountUserAPIKeys(ctx, userID)
	if err != nil {
		return database.UserApiKey{}, "", fmt.Errorf("count API keys: %w", err)
	}
	if count >= maxKeysPerUser {
		return database.UserApiKey{}, "", ErrKeyLimit
	}

	raw, keyHash, err := generate()
	if err != nil {
		return database.UserApiKey{}, "", err
	}
	key, err := s.zed.InsertUserAPIKey(ctx, database.InsertUserAPIKeyParams{
		ID:        uuid.New(),
		UserID:    userID,
		Name:      name,
		KeyHash:   keyHash,
		CreatedAt: database.Timestamptz(time.Now()),
	})
	if err != nil {
		return database.UserApiKey{}, "", fmt.Errorf("insert API key: %w", err)
	}
	return key, raw, nil
}

func (s *Service) Delete(ctx context.Context, userID, keyID uuid.UUID) (bool, error) {
	deleted, err := s.zed.DeleteUserAPIKey(ctx, database.DeleteUserAPIKeyParams{ID: keyID, UserID: userID})
	if err != nil {
		return false, fmt.Errorf("delete API key: %w", err)
	}
	return deleted > 0, nil
}

func generate() (raw string, keyHash []byte, err error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", nil, fmt.Errorf("generate API key: %w", err)
	}
	raw = Prefix + base64.RawURLEncoding.EncodeToString(secret)
	return raw, hash(raw), nil
}

func hash(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func isReadOnlyMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

type keyLimiter struct {
	mu       sync.Mutex
	limiters map[uuid.UUID]*limiterEntry
	rate     rate.Limit
	burst    int
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newKeyLimiter(requestsPerMinute, burst int64) *keyLimiter {
	if requestsPerMinute <= 0 || burst <= 0 {
		return nil
	}
	return &keyLimiter{
		limiters: make(map[uuid.UUID]*limiterEntry),
		rate:     rate.Limit(float64(requestsPerMinute) / 60),
		burst:    int(burst),
	}
}

func (l *keyLimiter) allow(id uuid.UUID) bool {
	if l == nil {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	entry, ok := l.limiters[id]
	if !ok {
		entry = &limiterEntry{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.limiters[id] = entry
	}
	entry.lastSeen = now
	if len(l.limiters) > 1000 {
		cutoff := now.Add(-time.Hour)
		for keyID, candidate := range l.limiters {
			if candidate.lastSeen.Before(cutoff) {
				delete(l.limiters, keyID)
			}
		}
	}
	return entry.limiter.Allow()
}

func (l *keyLimiter) retryAfterSeconds() int {
	if l == nil || l.rate <= 0 {
		return 1
	}
	return max(1, int(math.Ceil(1/float64(l.rate))))
}
