package servicesidekick

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
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
		http.MethodGet + " /api/v1/me/sidekicks/config":                 {},
		http.MethodPut + " /api/v1/me/sidekicks/config":                 {},
		http.MethodGet + " /api/v1/me/sidekicks/{sidekickID}/config":    {},
		http.MethodPut + " /api/v1/me/sidekicks/{sidekickID}/config":    {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}/config": {},
		http.MethodPatch + " /api/v1/me/sidekicks/{sidekickID}":         {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}":        {},
		http.MethodPut + " /api/v1/sidekick/status":                     {},
		http.MethodGet + " /api/v1/admin/users/{userID}/sidekicks/":     {},
	}, actual)
}

func TestEffectiveSidekickConfigPrecedence(t *testing.T) {
	t.Parallel()

	account := chroniclesdk.DefaultSidekickConfig()
	account.AutoUpload.Enabled = true
	require.Equal(t, account, effectiveSidekickConfig(account, nil))

	override := chroniclesdk.DefaultSidekickConfig()
	require.Equal(t, override, effectiveSidekickConfig(account, &override))
}

func TestSidekickStatusResponseConfigReconciliation(t *testing.T) {
	t.Parallel()

	config := chroniclesdk.DefaultSidekickConfig()
	hash, err := config.Hash()
	require.NoError(t, err)
	installation := chroniclesdk.SidekickInstallation{
		Configuration: &chroniclesdk.SidekickConfigState{
			Inherited: true, Effective: config, EffectiveHash: hash,
		},
	}

	legacy := sidekickStatusResponse(installation, "")
	require.Nil(t, legacy.Configuration)
	legacyJSON, err := json.Marshal(legacy)
	require.NoError(t, err)
	require.NotContains(t, string(legacyJSON), `"configuration"`)
	require.Equal(t, hash, legacy.ConfigHash)
	require.Equal(t, &config, legacy.Config)

	matched := sidekickStatusResponse(installation, hash)
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

	account := chroniclesdk.DefaultSidekickConfig()
	account.AutoUpload.Enabled = true
	accountJSON, err := account.CanonicalJSON()
	require.NoError(t, err)
	storedAccount, err := db.UpsertSidekickAccountConfig(ctx, database.UpsertSidekickAccountConfigParams{UserID: ownerID, Config: accountJSON})
	require.NoError(t, err)
	require.JSONEq(t, string(accountJSON), string(storedAccount))

	override := chroniclesdk.DefaultSidekickConfig()
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
		SidekickID: sidekickID, UserID: otherID, Config: accountJSON,
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
