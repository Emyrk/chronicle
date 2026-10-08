package chronauth

import (
	"log/slog"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newRelayTestSession(t *testing.T) (database.Store, database.UserAuthSession) {
	t.Helper()

	ctx := t.Context()
	store, _ := dbtestutil.NewDB(t)
	now := time.Now()
	user, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:        uuid.New(),
		Username:  "relay-" + uuid.NewString(),
		Email:     uuid.NewString() + "@example.com",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	linked, err := store.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID:        uuid.New(),
		LinkedID:  uuid.NewString(),
		UserID:    user.ID,
		Provider:  "discord",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	session, err := store.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
		ID:         uuid.New(),
		UserID:     user.ID,
		UserAuthID: linked.ID,
		ExpiresAt:  database.Timestamptz(now.Add(time.Hour)),
		CreatedAt:  database.Timestamptz(now),
		UpdatedAt:  database.Timestamptz(now),
		JwtID:      uuid.New(),
	})
	require.NoError(t, err)
	return store, session
}

func TestRelayCodeStore_GenerateAndRedeemAcrossStores(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	db, session := newRelayTestSession(t)
	issuer := NewRelayCodeStore(db)
	redeemer := NewRelayCodeStore(db)

	relay := &RelayCode{
		Session:      session,
		Provider:     "discord",
		TenantSlug:   "epoch",
		TenantName:   "Epoch",
		RedirectPath: "/raids",
		ExpiresAt:    time.Now().Add(60 * time.Second),
	}

	code, err := issuer.Generate(ctx, relay)
	require.NoError(t, err)
	require.NotEmpty(t, code)
	assert.Len(t, code, 64) // 32 bytes = 64 hex chars

	got, err := redeemer.Redeem(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, relay.Session.ID, got.Session.ID)
	assert.Equal(t, relay.Provider, got.Provider)
	assert.Equal(t, relay.TenantSlug, got.TenantSlug)
	assert.Equal(t, relay.RedirectPath, got.RedirectPath)
}

func TestRelayCodeStore_RedeemOnceAcrossStores(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	db, session := newRelayTestSession(t)
	issuer := NewRelayCodeStore(db)
	redeemer := NewRelayCodeStore(db)

	code, err := issuer.Generate(ctx, &RelayCode{
		Session:   session,
		Provider:  "discord",
		ExpiresAt: time.Now().Add(60 * time.Second),
	})
	require.NoError(t, err)

	_, err = redeemer.Redeem(ctx, code)
	require.NoError(t, err)

	_, err = issuer.Redeem(ctx, code)
	require.ErrorIs(t, err, errRelayCodeInvalid)
}

func TestRelayCodeStore_Expired(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	db, session := newRelayTestSession(t)
	store := NewRelayCodeStore(db)

	code, err := store.Generate(ctx, &RelayCode{
		Session:   session,
		Provider:  "discord",
		ExpiresAt: time.Now().Add(-time.Second),
	})
	require.NoError(t, err)

	_, err = store.Redeem(ctx, code)
	require.ErrorIs(t, err, errRelayCodeInvalid)
}

func TestRelayCodeStore_GenerateCleansExpiredCodes(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	db, session := newRelayTestSession(t)
	store := NewRelayCodeStore(db)

	_, err := store.Generate(ctx, &RelayCode{
		Session:   session,
		Provider:  "discord",
		ExpiresAt: time.Now().Add(-time.Second),
	})
	require.NoError(t, err)
	_, err = store.Generate(ctx, &RelayCode{
		Session:   session,
		Provider:  "discord",
		ExpiresAt: time.Now().Add(time.Minute),
	})
	require.NoError(t, err)

	deleted, err := db.DeleteExpiredOAuthRelayCodes(ctx)
	require.NoError(t, err)
	assert.Zero(t, deleted)
}

func TestRelayCodeStore_NotFound(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	db, _ := newRelayTestSession(t)
	store := NewRelayCodeStore(db)

	_, err := store.Redeem(ctx, "nonexistent")
	require.ErrorIs(t, err, errRelayCodeInvalid)
}

func TestRelayCodeStore_ConcurrentRedemptionHasOneWinner(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	db, session := newRelayTestSession(t)
	issuer := NewRelayCodeStore(db)
	code, err := issuer.Generate(ctx, &RelayCode{
		Session:   session,
		Provider:  "discord",
		ExpiresAt: time.Now().Add(time.Minute),
	})
	require.NoError(t, err)

	const attempts = 20
	var successes atomic.Int32
	var wg sync.WaitGroup
	errs := make([]error, attempts)
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			store := NewRelayCodeStore(db)
			_, errs[i] = store.Redeem(ctx, code)
			if errs[i] == nil {
				successes.Add(1)
			}
		}()
	}
	wg.Wait()

	assert.EqualValues(t, 1, successes.Load())
	for _, err := range errs {
		if err != nil {
			assert.ErrorIs(t, err, errRelayCodeInvalid)
		}
	}
}

func TestParseRelayTarget(t *testing.T) {
	t.Parallel()

	accessURL, _ := url.Parse("https://legacy.chronicleclassic.com")

	knownTenants := map[string]*TenantInfo{
		"epoch.chronicleclassic.com": {Slug: "epoch", Name: "Epoch"},
	}

	svc := &Service{
		accessURL: accessURL,
		logger:    slog.Default(),
		tenantChecker: func(host string) *TenantInfo {
			return knownTenants[host]
		},
	}

	tests := []struct {
		name       string
		from       string
		wantRelay  bool
		wantOrigin string
		wantPath   string
		wantSlug   string
	}{
		{
			name:      "relative path",
			from:      "/raids",
			wantRelay: false,
		},
		{
			name:      "empty string",
			from:      "",
			wantRelay: false,
		},
		{
			name:      "same domain (access URL)",
			from:      "https://legacy.chronicleclassic.com/raids",
			wantRelay: false,
		},
		{
			name:       "known tenant subdomain",
			from:       "https://epoch.chronicleclassic.com/raids",
			wantRelay:  true,
			wantOrigin: "https://epoch.chronicleclassic.com",
			wantPath:   "/raids",
			wantSlug:   "epoch",
		},
		{
			name:       "tenant with query params",
			from:       "https://epoch.chronicleclassic.com/raids?tab=boss",
			wantRelay:  true,
			wantOrigin: "https://epoch.chronicleclassic.com",
			wantPath:   "/raids?tab=boss",
			wantSlug:   "epoch",
		},
		{
			name:       "tenant root path",
			from:       "https://epoch.chronicleclassic.com",
			wantRelay:  true,
			wantOrigin: "https://epoch.chronicleclassic.com",
			wantPath:   "/",
			wantSlug:   "epoch",
		},
		{
			name:      "unknown host",
			from:      "https://evil.example.com/steal",
			wantRelay: false,
		},
		{
			name:      "invalid URL",
			from:      "://bad",
			wantRelay: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			origin, path, tenant, isRelay := svc.parseRelayTarget(tt.from)
			assert.Equal(t, tt.wantRelay, isRelay, "isRelay mismatch")
			if tt.wantRelay {
				assert.Equal(t, tt.wantOrigin, origin)
				assert.Equal(t, tt.wantPath, path)
				assert.Equal(t, tt.wantSlug, tenant.Slug)
			}
		})
	}
}

func TestParseRelayTarget_NilChecker(t *testing.T) {
	t.Parallel()
	svc := &Service{tenantChecker: nil}
	_, _, _, isRelay := svc.parseRelayTarget("https://epoch.chronicleclassic.com/raids")
	assert.False(t, isRelay, "should return false when tenantChecker is nil")
}
