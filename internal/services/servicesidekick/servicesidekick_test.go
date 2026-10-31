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
		http.MethodGet + " /api/v1/me/sidekicks/":                             {},
		http.MethodGet + " /api/v1/me/sidekicks/{sidekickID}/config":          {},
		http.MethodPut + " /api/v1/me/sidekicks/{sidekickID}/config":          {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}/config":       {},
		http.MethodPatch + " /api/v1/me/sidekicks/{sidekickID}":               {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}":              {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}/installation": {},
		http.MethodPut + " /api/v1/sidekick/status":                           {},
		http.MethodGet + " /api/v1/admin/users/{userID}/sidekicks/":           {},
	}, actual)
}

func TestSidekickStatusAllowsNullIssues(t *testing.T) {
	t.Parallel()

	var request chroniclesdk.SidekickStatusRequest
	require.NoError(t, json.Unmarshal([]byte(`{
		"sidekick_version": "0.7.0",
		"start_at_login": true,
		"auto_upload_capabilities": {},
		"wow_directories": [],
		"issues": null
	}`), &request))
	require.Nil(t, request.Issues)
	require.False(t, sidekickStatusMissingRequiredFields(request))
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

	sidekickID := uuid.New()
	changed := sidekickStatusResponse(sidekickID, state, "")
	changedJSON, err := json.Marshal(changed)
	require.NoError(t, err)
	require.NotContains(t, string(changedJSON), `"configuration"`)
	require.Equal(t, "/account/sidekick/installations/"+sidekickID.String(), changed.SettingsURL)
	require.Equal(t, hash, changed.ConfigHash)
	require.Equal(t, &config, changed.Config)

	matched := sidekickStatusResponse(sidekickID, state, hash)
	matchedJSON, err := json.Marshal(matched)
	require.NoError(t, err)
	var matchedFields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(matchedJSON, &matchedFields))
	require.NotContains(t, matchedFields, "config")
	require.Equal(t, "/account/sidekick/installations/"+sidekickID.String(), matched.SettingsURL)
	require.Equal(t, hash, matched.ConfigHash)
	require.Nil(t, matched.Config)
}

func TestDecodeSidekickConfigAddsArchiveDefaultsToLegacyConfig(t *testing.T) {
	t.Parallel()

	config, needsUpgrade, err := decodeSidekickConfig([]byte(`{"version":1,"wow_directories":{}}`))
	require.NoError(t, err)
	require.True(t, needsUpgrade)
	require.Equal(t, chroniclesdk.SidekickArchiveConfig{
		Enabled:       true,
		RetentionDays: chroniclesdk.SidekickArchiveRetentionDaysDefault,
	}, config.Archive)

	payload, err := config.CanonicalJSON()
	require.NoError(t, err)
	_, needsUpgrade, err = decodeSidekickConfig(payload)
	require.NoError(t, err)
	require.False(t, needsUpgrade)
}

func TestDeleteMySidekickRevokesAuthorizationAndAllowsFreshRegistration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)

	ownerID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "sidekick-delete-owner-" + ownerID.String()[:8],
	})
	require.NoError(t, err)

	installationID := uuid.New()
	_, err = db.UpsertSidekickInstallation(ctx, database.UpsertSidekickInstallationParams{
		ID: installationID, UserID: ownerID, Name: "Raid PC", Platform: "test", Version: "1",
	})
	require.NoError(t, err)
	_, err = db.UpsertSidekickConfigOverride(ctx, database.UpsertSidekickConfigOverrideParams{
		SidekickID: installationID, UserID: ownerID, Config: []byte(`{}`),
	})
	require.NoError(t, err)

	const requestID = "sidekick-delete-request"
	require.NoError(t, db.InsertSidekickOAuthGrant(ctx, database.InsertSidekickOAuthGrantParams{
		OauthRequestID: requestID, SidekickID: installationID,
	}))
	expiresAt := pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}
	for _, tokenType := range []string{"access", "refresh"} {
		require.NoError(t, db.CreateOAuthTokenSession(ctx, database.CreateOAuthTokenSessionParams{
			TokenType: tokenType, Signature: tokenType + "-signature", RequestID: requestID,
			Request: []byte(`{}`), ExpiresAt: expiresAt,
		}))
	}
	require.NoError(t, db.CreateOAuthDeviceSession(ctx, database.CreateOAuthDeviceSessionParams{
		DeviceSignature: "device-signature", UserSignature: "user-signature", Request: []byte(`{}`),
		ExpiresAt: expiresAt, SidekickInstallationID: uuid.NullUUID{UUID: installationID, Valid: true},
	}))

	service := &Service{zed: authz.NewDatabaseOnly(slog.Default(), db)}
	service.setupRoutes()
	deleteRequest := func(userID uuid.UUID) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodDelete, "/"+installationID.String()+"/installation", nil)
		req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
		recorder := httptest.NewRecorder()
		service.AccountRoutes().ServeHTTP(recorder, req)
		return recorder
	}

	ownerRecorder := deleteRequest(ownerID)
	require.Equal(t, http.StatusNoContent, ownerRecorder.Code, ownerRecorder.Body.String())
	_, err = db.GetSidekickInstallationByUser(ctx, database.GetSidekickInstallationByUserParams{
		SidekickID: installationID, UserID: ownerID,
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.GetSidekickConfigOverride(ctx, database.GetSidekickConfigOverrideParams{
		SidekickID: installationID, UserID: ownerID,
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	requestIDs, err := db.ListSidekickOAuthGrantRequestIDs(ctx, installationID)
	require.NoError(t, err)
	require.Empty(t, requestIDs)
	for _, tokenType := range []string{"access", "refresh"} {
		_, err = db.GetOAuthTokenSession(ctx, database.GetOAuthTokenSessionParams{
			TokenType: tokenType, Signature: tokenType + "-signature",
		})
		require.ErrorIs(t, err, pgx.ErrNoRows)
	}
	deviceSession, err := db.GetOAuthDeviceSession(ctx, "device-signature")
	require.NoError(t, err)
	require.True(t, deviceSession.Invalidated)

	fresh, err := db.UpsertSidekickInstallation(ctx, database.UpsertSidekickInstallationParams{
		ID: installationID, UserID: ownerID, Name: "Raid PC re-registered", Platform: "test", Version: "2",
	})
	require.NoError(t, err)
	require.Equal(t, installationID, fresh.ID)
	require.Equal(t, "Raid PC re-registered", fresh.Name)
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
