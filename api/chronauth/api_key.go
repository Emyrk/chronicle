package chronauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/time/rate"
)

const (
	APIKeyPrefix   = "chr_cli_"
	APIKeyProvider = "api_key"
)

var errAPIKeyRateLimited = errors.New("API key rate limit exceeded")

type APIKeyOptions struct {
	RequestsPerMinute int64
	Burst             int64
}

type apiKeyLimiter struct {
	mu       sync.Mutex
	limiters map[uuid.UUID]*apiKeyLimiterEntry
	rate     rate.Limit
	burst    int
}

type apiKeyLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newAPIKeyLimiter(opts APIKeyOptions) *apiKeyLimiter {
	if opts.RequestsPerMinute <= 0 || opts.Burst <= 0 {
		return nil
	}
	return &apiKeyLimiter{
		limiters: make(map[uuid.UUID]*apiKeyLimiterEntry),
		rate:     rate.Limit(float64(opts.RequestsPerMinute) / 60),
		burst:    int(opts.Burst),
	}
}

func (l *apiKeyLimiter) allow(id uuid.UUID) bool {
	if l == nil {
		return true
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	entry, ok := l.limiters[id]
	if !ok {
		entry = &apiKeyLimiterEntry{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.limiters[id] = entry
	}
	entry.lastSeen = now

	// Keep the per-key map bounded without a background goroutine.
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

func (l *apiKeyLimiter) retryAfterSeconds() int {
	if l == nil || l.rate <= 0 {
		return 1
	}
	return max(1, int(math.Ceil(1/float64(l.rate))))
}

func GenerateAPIKey() (raw string, hash []byte, err error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", nil, fmt.Errorf("generate API key: %w", err)
	}
	raw = APIKeyPrefix + base64.RawURLEncoding.EncodeToString(secret)
	sum := sha256.Sum256([]byte(raw))
	return raw, sum[:], nil
}

func HashAPIKey(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func isReadOnlyMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func (s *Service) authenticateAPIKey(ctx context.Context, raw string) (*claims.Claims, error) {
	key, err := s.Zed.GetUserAPIKeyByHash(ctx, HashAPIKey(raw))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotAuthorized
	}
	if err != nil {
		return nil, fmt.Errorf("look up API key: %w", err)
	}

	allowed, err := s.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanCreate_api_key_User(policy.New().User(key.UserID)))
	if err != nil {
		return nil, fmt.Errorf("check API access permission: %w", err)
	}
	if !allowed {
		return nil, ErrNotAuthorized
	}
	if !s.apiKeyLimiter.allow(key.ID) {
		return nil, errAPIKeyRateLimited
	}

	now := time.Now()
	if err := s.Zed.TouchUserAPIKeyLastUsed(ctx, database.TouchUserAPIKeyLastUsedParams{
		LastUsedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		ID:             key.ID,
		LastUsedBefore: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true},
	}); err != nil {
		s.logger.Warn("failed to update API key last-used time", "api_key_id", key.ID, "error", err)
	}

	return &claims.Claims{
		Issuer:      s.sessions.Issuer,
		Subject:     key.UserID,
		ID:          key.ID,
		SessionID:   key.ID,
		APIKeyID:    key.ID,
		Provider:    APIKeyProvider,
		IssuedAt:    nil,
		Expiry:      nil,
		Refreshable: false,
	}, nil
}
