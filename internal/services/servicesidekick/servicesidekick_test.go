package servicesidekick

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestMountedRoutes(t *testing.T) {
	t.Parallel()

	service := &Service{}
	service.setupRoutes()

	router := chi.NewRouter()
	router.Mount("/api/v1/me/sidekicks", service.AccountRoutes())
	router.Mount("/api/v1/sidekick", service.StatusRoutes())
	router.Mount("/api/v1/admin/users/{userID}/sidekicks", service.AdminRoutes())

	actual := make(map[string]struct{})
	require.NoError(t, chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		actual[method+" "+route] = struct{}{}
		return nil
	}))
	require.Equal(t, map[string]struct{}{
		http.MethodGet + " /api/v1/me/sidekicks/":                       {},
		http.MethodGet + " /api/v1/me/sidekicks/{sidekickID}/config":    {},
		http.MethodPut + " /api/v1/me/sidekicks/{sidekickID}/config":    {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}/config": {},
		http.MethodPatch + " /api/v1/me/sidekicks/{sidekickID}":         {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}":        {},
		http.MethodPut + " /api/v1/sidekick/status":                     {},
		http.MethodGet + " /api/v1/admin/users/{userID}/sidekicks/":     {},
	}, actual)
}

func TestListMySidekicksWithoutSavedConfig(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "sidekick-list-" + userID.String()[:8],
	})
	require.NoError(t, err)

	service := &Service{zed: authz.NewDatabaseOnly(slog.Default(), db)}
	service.setupRoutes()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	recorder := httptest.NewRecorder()
	service.AccountRoutes().ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response chroniclesdk.ListSidekicksResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Empty(t, response.Sidekicks)
}

func TestNormalizeSidekickConfigDisablesUnsupportedModes(t *testing.T) {
	t.Parallel()

	id := "wowdir_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	config := chroniclesdk.DefaultSidekickConfig()
	config.WoWDirectories[id] = chroniclesdk.SidekickDirectoryConfig{
		GameFormat: chroniclesdk.SidekickGameFormatWotLK335a,
		AutoUpload: chroniclesdk.SidekickAutoUploadOnGameExit,
	}

	normalized := normalizeSidekickConfig(config, chroniclesdk.SidekickAutoUploadCapabilities{})
	require.Equal(t, chroniclesdk.SidekickAutoUploadDisabled, normalized.WoWDirectories[id].AutoUpload)

	capabilities := chroniclesdk.SidekickAutoUploadCapabilities{
		chroniclesdk.SidekickGameFormatWotLK335a: {chroniclesdk.SidekickAutoUploadOnGameExit},
	}
	normalized = normalizeSidekickConfig(config, capabilities)
	require.Equal(t, chroniclesdk.SidekickAutoUploadOnGameExit, normalized.WoWDirectories[id].AutoUpload)
}

func TestSidekickStatusResponseConfigReconciliation(t *testing.T) {
	t.Parallel()

	config := chroniclesdk.DefaultSidekickConfig()
	hash, err := config.Hash()
	require.NoError(t, err)
	state := chroniclesdk.SidekickConfigState{Config: config, Hash: hash}

	changed := sidekickStatusResponse(state, "")
	changedJSON, err := json.Marshal(changed)
	require.NoError(t, err)
	require.NotContains(t, string(changedJSON), `"configuration"`)
	require.Equal(t, hash, changed.ConfigHash)
	require.Equal(t, &config, changed.Config)

	matched := sidekickStatusResponse(state, hash)
	matchedJSON, err := json.Marshal(matched)
	require.NoError(t, err)
	var matchedFields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(matchedJSON, &matchedFields))
	require.NotContains(t, matchedFields, "config")
	require.Equal(t, hash, matched.ConfigHash)
	require.Nil(t, matched.Config)
}

func TestSidekickConfigStorageAndOwnership(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)

	now := pgtype.Timestamptz{Time: time.Now(), Valid: true}
	ownerID := uuid.New()
	otherID := uuid.New()
	for _, user := range []struct {
		id   uuid.UUID
		name string
	}{{ownerID, "sidekick-config-owner"}, {otherID, "sidekick-config-other"}} {
		_, err := db.InsertUser(ctx, database.InsertUserParams{
			ID: user.id, Username: user.name, Email: user.name + "@example.com", CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, err)
	}

	sidekickID := uuid.New()
	_, err := db.UpsertSidekickInstallation(ctx, database.UpsertSidekickInstallationParams{
		ID: sidekickID, UserID: ownerID, Name: "Raid PC", Platform: "test", Version: "1",
	})
	require.NoError(t, err)

	override := chroniclesdk.DefaultSidekickConfig()
	override.WoWDirectories["wowdir_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] = chroniclesdk.SidekickDirectoryConfig{
		GameFormat: chroniclesdk.SidekickGameFormatWotLK335a,
		AutoUpload: chroniclesdk.SidekickAutoUploadDisabled,
	}
	overrideJSON, err := override.CanonicalJSON()
	require.NoError(t, err)
	storedOverride, err := db.UpsertSidekickConfigOverride(ctx, database.UpsertSidekickConfigOverrideParams{
		SidekickID: sidekickID, UserID: ownerID, Config: overrideJSON,
	})
	require.NoError(t, err)
	require.JSONEq(t, string(overrideJSON), string(storedOverride))

	_, err = db.GetSidekickConfigOverride(ctx, database.GetSidekickConfigOverrideParams{SidekickID: sidekickID, UserID: otherID})
	require.True(t, errors.Is(err, pgx.ErrNoRows))
	_, err = db.UpsertSidekickConfigOverride(ctx, database.UpsertSidekickConfigOverrideParams{
		SidekickID: sidekickID, UserID: otherID, Config: overrideJSON,
	})
	require.True(t, errors.Is(err, pgx.ErrNoRows))
	_, err = db.DeleteSidekickConfigOverride(ctx, database.DeleteSidekickConfigOverrideParams{SidekickID: sidekickID, UserID: otherID})
	require.True(t, errors.Is(err, pgx.ErrNoRows))

	deleted, err := db.DeleteSidekickConfigOverride(ctx, database.DeleteSidekickConfigOverrideParams{SidekickID: sidekickID, UserID: ownerID})
	require.NoError(t, err)
	require.JSONEq(t, string(overrideJSON), string(deleted))
	_, err = db.GetSidekickConfigOverride(ctx, database.GetSidekickConfigOverrideParams{SidekickID: sidekickID, UserID: ownerID})
	require.True(t, errors.Is(err, pgx.ErrNoRows))
}
