package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAttendanceOnly(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		url  string
		want bool
	}{
		{name: "true", url: "/?attendance_only=true", want: true},
		{name: "one", url: "/?attendance_only=1", want: true},
		{name: "false", url: "/?attendance_only=false", want: false},
		{name: "missing", url: "/", want: false},
		{name: "invalid", url: "/?attendance_only=yes", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			r := httptest.NewRequest("GET", tt.url, nil)
			require.Equal(t, tt.want, attendanceOnly(r))
		})
	}
}

func TestUngroupInstanceMaintainsDuplicateGroupURLsAndLists(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		memberCount int
		unlinkIndex int
	}{
		{name: "two member anchor", memberCount: 2, unlinkIndex: 0},
		{name: "larger group anchor", memberCount: 3, unlinkIndex: 0},
		{name: "two member non-anchor", memberCount: 2, unlinkIndex: 1},
		{name: "larger group non-anchor", memberCount: 3, unlinkIndex: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			store, _ := dbtestutil.NewDB(t)
			ctx := testutil.Context(t, testutil.WaitMedium)
			serverID := uuid.New()
			realmID := uuid.New()
			_, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{
				ID: serverID, Name: "server-" + serverID.String()[:8],
			})
			require.NoError(t, err)
			_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
				ID: realmID, ServerID: serverID, Name: "realm-" + realmID.String()[:8],
			})
			require.NoError(t, err)
			userID := uuid.New()
			_, err = store.InsertUser(ctx, database.InsertUserParams{
				ID: userID, Username: "u-" + userID.String()[:8],
			})
			require.NoError(t, err)
			logGroupID := uuid.New()
			start := time.Date(2026, 9, 16, 20, 0, 0, 0, time.UTC)
			_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
				ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
				CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
			})
			require.NoError(t, err)
			require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

			instanceIDs := make([]uuid.UUID, tt.memberCount)
			for i := range instanceIDs {
				instanceIDs[i] = uuid.New()
				_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
					ID: instanceIDs[i], RealmID: realmID, LogGroupID: logGroupID,
					Name: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40,
					StartTime:    database.Timestamptz(start.Add(time.Duration(i) * time.Second)),
					EndTime:      database.Timestamptz(start.Add(time.Hour)),
					Capabilities: []string{},
				})
				require.NoError(t, err)
			}
			anchorID := instanceIDs[0]
			require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
				DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true},
				Ids:              instanceIDs,
			}))

			zed := authz.NewDatabaseOnly(testutil.Logger(t), store)
			handlerAPI := &API{
				Opts:      &Options{Zed: zed},
				Chronicle: &chronicle.Chronicle{},
			}
			router := chi.NewRouter()
			router.Route("/instances/{instance_id}", func(r chi.Router) {
				r.Use(httpmw.InstanceIDMiddleware(zed))
				r.Delete("/duplicate-group", handlerAPI.UngroupInstance)
				r.Get("/duplicates", handlerAPI.ListDuplicateInstances)
			})

			unlinkedID := instanceIDs[tt.unlinkIndex]
			request := httptest.NewRequest(http.MethodDelete, "/instances/"+unlinkedID.String()+"/duplicate-group", nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, http.StatusNoContent, response.Code, response.Body.String())

			expectedGroupID := anchorID
			if tt.unlinkIndex == 0 {
				expectedGroupID = instanceIDs[1]
			}
			for i, instanceID := range instanceIDs {
				request = httptest.NewRequest(http.MethodGet, "/instances/"+instanceID.String()+"/duplicates", nil)
				response = httptest.NewRecorder()
				router.ServeHTTP(response, request)
				require.Equal(t, http.StatusOK, response.Code, response.Body.String())

				var duplicates []chroniclesdk.DuplicateInstance
				require.NoError(t, json.Unmarshal(response.Body.Bytes(), &duplicates))
				if i == tt.unlinkIndex {
					require.Empty(t, duplicates)
					continue
				}
				require.Len(t, duplicates, tt.memberCount-1)
				require.Contains(t, duplicateInstanceIDs(duplicates), expectedGroupID)
			}
		})
	}
}

func duplicateInstanceIDs(instances []chroniclesdk.DuplicateInstance) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(instances))
	for _, instance := range instances {
		ids = append(ids, instance.ID)
	}
	return ids
}
