package serviceinference

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestPersonalDiscordSettingsRequireLinkAndServerTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	id := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, id, []string{"inference_capable"}))
	db, _ := dbtestutil.NewDB(t)
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: id, Username: "discord-" + id.String()[:8]})
	require.NoError(t, err)
	service := &Service{zed: zed, db: db, enabled: true, logger: slog.Default()}
	request := func(method, body string, tenant bool) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, "/", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		contextWithClaims := chronauth.WithClaims(req.Context(), &claims.Claims{Subject: id})
		if tenant {
			contextWithClaims = servicetenant.WithTenant(contextWithClaims, database.Tenant{Slug: pgtype.Text{String: "turtle", Valid: true}})
		}
		req = req.WithContext(contextWithClaims)
		recorder := httptest.NewRecorder()
		service.AccountRoutes().ServeHTTP(recorder, req)
		return recorder
	}
	require.Equal(t, http.StatusForbidden, request(http.MethodPut, `{"assistant_models":{"site-help":"provider/model"},"discord_enabled":false}`, false).Code)
	_, err = db.GetInferenceUserConfig(ctx, id)
	require.ErrorIs(t, err, pgx.ErrNoRows, "a forbidden Discord update must not partially save other settings")
	_, err = db.InsertUserAuth(ctx, database.InsertUserAuthParams{ID: uuid.New(), UserID: id, LinkedID: "discord-123", Provider: "discord"})
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, request(http.MethodPut, `{"discord_use_current_tenant":true}`, false).Code)
	response := request(http.MethodPut, `{"assistant_models":{"site-help":"provider/model"},"discord_enabled":false,"discord_use_current_tenant":true}`, true)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var settings chroniclesdk.InferenceSettings
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &settings))
	require.True(t, settings.DiscordLinked)
	require.False(t, settings.DiscordEnabled)
	require.Equal(t, "turtle", settings.DiscordDefaultTenant)
	require.Equal(t, "provider/model", settings.Assistants[0].DefaultModel)
	_, err = service.GetDiscordTenant(ctx, id, "someone-else")
	require.Error(t, err, "the bot must recheck the linked Discord identity")
	slug, err := service.GetDiscordTenant(ctx, id, "discord-123")
	require.NoError(t, err)
	require.Equal(t, "turtle", slug)
	require.NoError(t, zed.SetInferenceDisabled(ctx, id, true))
	_, err = service.GetDiscordTenant(ctx, id, "discord-123")
	require.Error(t, err, "AI opt-out must block bot settings commands too")
	_, err = service.SetDiscordTenant(ctx, id, "discord-123", "turtle")
	require.Error(t, err)
	stored, err := db.GetInferenceUserConfig(context.Background(), id)
	require.NoError(t, err)
	require.Contains(t, string(stored), `"discord_default_tenant": "turtle"`)
}
