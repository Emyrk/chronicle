package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestWhoAmIUnauthenticated(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/api/v1/whoami", nil)
	response := httptest.NewRecorder()

	(&API{}).WhoAmI(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
	require.Empty(t, response.Body.String())
}

func TestWhoAmIAuthenticated(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	store := servicedbstore.DatabaseStore(broker)
	userID := uuid.New()
	sessionID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "whoami-" + userID.String()[:8],
	})
	require.NoError(t, err)

	handler := (&API{Zed: zed, Opts: &Options{Zed: zed}}).WhoAmI
	request := httptest.NewRequest(http.MethodGet, "/api/v1/whoami", nil)
	request = request.WithContext(chronauth.WithClaims(request.Context(), &claims.Claims{
		Subject:   userID,
		SessionID: sessionID,
		Provider:  "test",
	}))
	response := httptest.NewRecorder()

	handler(response, request)

	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var session chroniclesdk.Session
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &session))
	require.Equal(t, userID, session.UserID)
	require.Equal(t, sessionID, session.SessionID)
}

func TestUpdateMyPreferencesCharacterCosmetics(t *testing.T) {
	t.Parallel()

	store, _ := dbtestutil.NewDB(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "cosmetics-" + userID.String()[:8],
	})
	require.NoError(t, err)

	user, err := store.GetUserByID(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, string(chroniclesdk.CharacterCosmeticsEnabled), user.CharacterCosmetics)
	require.Equal(t, chroniclesdk.CharacterCosmeticsEnabled, userPreferences(user).CharacterCosmetics)

	handler := (&API{Opts: &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)}}).UpdateMyPreferences

	disabled := chroniclesdk.CharacterCosmeticsDisabled
	retention := int32(24)
	body, err := json.Marshal(chroniclesdk.UpdatePreferencesRequest{
		CharacterCosmetics:   &disabled,
		RawLogRetentionHours: &retention,
	})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPatch, "/me/preferences", bytes.NewReader(body))
	request = request.WithContext(chronauth.WithClaims(request.Context(), &claims.Claims{Subject: userID}))
	response := httptest.NewRecorder()
	handler(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	var preferences chroniclesdk.Preferences
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &preferences))
	require.Equal(t, chroniclesdk.CharacterCosmeticsDisabled, preferences.CharacterCosmetics)
	require.NotNil(t, preferences.RawLogRetentionHours)
	require.Equal(t, int32(24), *preferences.RawLogRetentionHours)

	invalid := chroniclesdk.CharacterCosmeticsDisplayMode("invalid")
	body, err = json.Marshal(chroniclesdk.UpdatePreferencesRequest{CharacterCosmetics: &invalid})
	require.NoError(t, err)
	request = httptest.NewRequest(http.MethodPatch, "/me/preferences", bytes.NewReader(body))
	request = request.WithContext(chronauth.WithClaims(request.Context(), &claims.Claims{Subject: userID}))
	response = httptest.NewRecorder()
	handler(response, request)
	require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())

	user, err = store.GetUserByID(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, string(chroniclesdk.CharacterCosmeticsDisabled), user.CharacterCosmetics)
	require.True(t, user.RawLogRetentionHours.Valid)
	require.Equal(t, int32(24), user.RawLogRetentionHours.Int32)
}
