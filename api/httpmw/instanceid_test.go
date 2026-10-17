package httpmw

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestPrivateInstanceIgnoresStalePublicWildcard(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	otherID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	logID := uuid.New()
	instanceID := uuid.New()

	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "private-instance-owner-" + ownerID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "private-instance-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "private-instance-realm-" + realmID.String()})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2, Private: true,
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, zed.InsertParsedLogGroup(ctx, logID))
	_, err = zed.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: "Molten Core",
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)

	// Simulate a concurrent visibility transition leaving an obsolete public
	// instance tuple behind. Private authorization must use raid_log#view.
	builder := policy.New()
	builder.Instance(instanceID).PublicWildcard()
	_, err = zed.Write(ctx, *builder.Txn())
	require.NoError(t, err)

	router := chi.NewRouter()
	router.Route("/{instance_id}", func(r chi.Router) {
		r.Use(InstanceIDMiddleware(zed), InstanceViewMiddleware(zed))
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	})

	request := httptest.NewRequest(http.MethodGet, "/"+instanceID.String()+"/", nil)
	request = request.WithContext(authz.AsUser(request.Context(), otherID))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusForbidden, response.Code)

	request = httptest.NewRequest(http.MethodGet, "/"+instanceID.String()+"/", nil)
	request = request.WithContext(authz.AsUser(request.Context(), ownerID))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusNoContent, response.Code)
}
