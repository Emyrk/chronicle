package httpmw

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestUnlistedInstanceResolvesAnonymouslyByIDAndSlug(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	logID := uuid.New()
	instanceID := uuid.New()
	const slug = "unlisted-molten-core"

	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "unlisted-instance-owner-" + ownerID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "unlisted-instance-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "unlisted-instance-realm-" + realmID.String()})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2, Unlisted: true,
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, zed.InsertParsedLogGroup(ctx, logID))
	_, err = zed.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: "Molten Core",
		HashedSlug:   pgtype.Text{String: slug, Valid: true},
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)

	router := chi.NewRouter()
	router.Route("/{instance_id}", func(r chi.Router) {
		r.Use(InstanceIDMiddleware(zed))
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, instanceID, Instance(r.Context()).ID)
			require.True(t, InstanceUnlisted(r.Context()))
			w.WriteHeader(http.StatusNoContent)
		})
	})

	for _, identifier := range []string{instanceID.String(), slug} {
		request := httptest.NewRequest(http.MethodGet, "/"+identifier+"/", nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		require.Equal(t, http.StatusNoContent, response.Code)
	}
}
