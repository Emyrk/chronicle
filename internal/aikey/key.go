// Package aikey implements AI keys: short-lived, read-only, tier-aware
// credentials a user pastes into a chat AI as ?ai_key=ck_... on GET links.
// See issue #1656.
package aikey

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// secretBytes is the random part of a key: 128 bits.
const secretBytes = 16

// Generate returns a new key secret: ck_ plus 32 lowercase hex characters.
func Generate() (string, error) {
	b := make([]byte, secretBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return chroniclesdk.AIKeyPrefix + hex.EncodeToString(b), nil
}

// ValidFormat reports whether s looks like a key, so malformed values are
// rejected without a database lookup.
func ValidFormat(s string) bool {
	rest, ok := strings.CutPrefix(s, chroniclesdk.AIKeyPrefix)
	if !ok || len(rest) != secretBytes*2 {
		return false
	}
	for _, c := range rest {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// Hash is what the database stores. The secret has 128 random bits, so a
// fast hash is enough.
func Hash(secret string) []byte {
	sum := sha256.Sum256([]byte(secret))
	return sum[:]
}

// Key is an authenticated AI key on a request. It never holds the secret.
type Key struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	TenantID    uuid.UUID
	PrivateData bool
	ExpiresAt   time.Time
	Benefits    chroniclesdk.AIKeyBenefits
}

type (
	keyContextKey    struct{}
	secretContextKey struct{}
)

// FromContext returns the request's AI key, if it carried a valid one.
func FromContext(ctx context.Context) (Key, bool) {
	k, ok := ctx.Value(keyContextKey{}).(Key)
	return k, ok
}

// WithKey marks ctx as authenticated by an AI key. secret is kept apart from
// Key so printing a Key can't leak it; Link reads it back.
func WithKey(ctx context.Context, k Key, secret string) context.Context {
	ctx = context.WithValue(ctx, keyContextKey{}, k)
	return context.WithValue(ctx, secretContextKey{}, secret)
}

// ExpiresAt is when a key stops working at the given benefits: its own expiry,
// or sooner if the owner's tier no longer allows a lifetime that long.
func ExpiresAt(row database.AiKey, b chroniclesdk.AIKeyBenefits) time.Time {
	expires := row.ExpiresAt.Time
	if capped := row.CreatedAt.Time.Add(MaxLifetime(b)); capped.Before(expires) {
		expires = capped
	}
	return expires
}

// SDK converts a stored key to its API form.
func SDK(row database.AiKey, b chroniclesdk.AIKeyBenefits, now time.Time) chroniclesdk.AIKey {
	k := chroniclesdk.AIKey{
		ID:            row.ID,
		CreatedAt:     row.CreatedAt.Time,
		ExpiresAt:     ExpiresAt(row, b),
		PrivateData:   row.PrivateData,
		LastUserAgent: row.LastUserAgent,
		RequestCount:  row.RequestCount,
	}
	k.Expired = !now.Before(k.ExpiresAt)
	if row.LastUsedAt.Valid {
		t := row.LastUsedAt.Time
		k.LastUsedAt = &t
	}
	return k
}

// TenantScope is the tenant_scope_id for a tenant: uuid.Nil is the root
// community.
func TenantScope(tenantID uuid.UUID) uuid.NullUUID {
	return uuid.NullUUID{UUID: tenantID, Valid: true}
}
