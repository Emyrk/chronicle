package serviceapikey

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGenerate(t *testing.T) {
	t.Parallel()

	first, firstHash, err := generate()
	require.NoError(t, err)
	second, secondHash, err := generate()
	require.NoError(t, err)

	require.True(t, strings.HasPrefix(first, Prefix))
	require.NotEqual(t, first, second)
	require.Len(t, firstHash, 32)
	require.True(t, bytes.Equal(firstHash, hash(first)))
	require.False(t, bytes.Equal(firstHash, secondHash))
}

func TestKeyLimiter(t *testing.T) {
	t.Parallel()

	keyID := uuid.New()
	limiter := newKeyLimiter(60, 2)
	require.True(t, limiter.allow(keyID))
	require.True(t, limiter.allow(keyID))
	require.False(t, limiter.allow(keyID))
	require.True(t, limiter.allow(uuid.New()), "limits should be isolated per token")
	require.True(t, newKeyLimiter(0, 0).allow(keyID), "zero values disable rate limiting")
}

func TestReadOnlyMethods(t *testing.T) {
	t.Parallel()

	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		require.True(t, isReadOnlyMethod(method), method)
	}
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		require.False(t, isReadOnlyMethod(method), method)
	}
}

func TestServiceLifecycle(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)
	service := &Service{
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		zed:     zed,
		limiter: newKeyLimiter(60, 10),
	}

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "api-service-user",
		Email:    "api-service-user@example.com",
	})
	require.NoError(t, err)
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"api_access"}))

	key, raw, err := service.Create(ctx, userID, "guild scraper")
	require.NoError(t, err)
	require.Equal(t, userID, key.UserID)
	require.True(t, IsToken(raw))

	keys, err := service.List(ctx, userID)
	require.NoError(t, err)
	require.Len(t, keys, 1)

	identity, err := service.Authenticate(ctx, raw, http.MethodGet)
	require.NoError(t, err)
	require.Equal(t, Identity{UserID: userID, KeyID: key.ID}, identity)

	_, err = service.Authenticate(ctx, raw, http.MethodPost)
	require.ErrorIs(t, err, ErrReadOnly)

	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"upload_capable"}))
	_, err = service.Authenticate(ctx, raw, http.MethodGet)
	require.ErrorIs(t, err, ErrNotAuthorized)

	deleted, err := service.Delete(ctx, userID, key.ID)
	require.NoError(t, err)
	require.True(t, deleted)
	_, err = service.Authenticate(ctx, raw, http.MethodGet)
	require.ErrorIs(t, err, ErrNotAuthorized)
}
