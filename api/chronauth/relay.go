package chronauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5"
)

// TenantInfo is a lightweight struct carrying tenant metadata through the
// relay flow. It avoids importing the full database.Tenant type into callers.
type TenantInfo struct {
	Slug string
	Name string
}

// RelayCode holds the data needed to set a session cookie on a tenant subdomain
// after OAuth completes on the main domain.
type RelayCode struct {
	Session      database.UserAuthSession
	Provider     string
	TenantSlug   string
	TenantName   string
	RedirectPath string // Path to redirect to after setting cookie (e.g. "/raids")
	ExpiresAt    time.Time
}

// RelayCodeStore persists one-time cross-subdomain auth relay codes in
// PostgreSQL so any backend node can redeem them. Only a SHA-256 hash of each
// short-lived code is stored.
type RelayCodeStore struct {
	db database.StoreQueries
}

func NewRelayCodeStore(db database.StoreQueries) *RelayCodeStore {
	return &RelayCodeStore{db: db}
}

// Generate creates and persists a one-time relay code. Expired rows are cleaned
// opportunistically whenever a new code is issued.
func (s *RelayCodeStore) Generate(ctx context.Context, relay *RelayCode) (string, error) {
	if _, err := s.db.DeleteExpiredOAuthRelayCodes(ctx); err != nil {
		return "", fmt.Errorf("delete expired OAuth relay codes: %w", err)
	}

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate OAuth relay code: %w", err)
	}
	code := hex.EncodeToString(b)
	hash := sha256.Sum256([]byte(code))

	err := s.db.InsertOAuthRelayCode(ctx, database.InsertOAuthRelayCodeParams{
		CodeHash:          hash[:],
		UserAuthSessionID: relay.Session.ID,
		Provider:          relay.Provider,
		TenantSlug:        relay.TenantSlug,
		TenantName:        relay.TenantName,
		RedirectPath:      relay.RedirectPath,
		ExpiresAt:         database.Timestamptz(relay.ExpiresAt),
	})
	if err != nil {
		return "", fmt.Errorf("insert OAuth relay code: %w", err)
	}
	return code, nil
}

var errRelayCodeInvalid = errors.New("relay code not found or expired")

// Redeem atomically deletes and returns a relay code. The DELETE ... RETURNING
// query guarantees that concurrent requests across nodes have one winner.
func (s *RelayCodeStore) Redeem(ctx context.Context, code string) (*RelayCode, error) {
	hash := sha256.Sum256([]byte(code))
	redeemed, err := s.db.RedeemOAuthRelayCode(ctx, hash[:])
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errRelayCodeInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("redeem OAuth relay code: %w", err)
	}
	if !redeemed.RelayExpiresAt.Valid || time.Now().After(redeemed.RelayExpiresAt.Time) {
		return nil, errRelayCodeInvalid
	}
	return &RelayCode{
		Session:      redeemed.UserAuthSession,
		Provider:     redeemed.Provider,
		TenantSlug:   redeemed.TenantSlug,
		TenantName:   redeemed.TenantName,
		RedirectPath: redeemed.RedirectPath,
		ExpiresAt:    redeemed.RelayExpiresAt.Time,
	}, nil
}
