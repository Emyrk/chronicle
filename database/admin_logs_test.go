package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestAdminLogsFilters(t *testing.T) {
	t.Parallel()

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := servicetenant.AdminBypass(testutil.Context(t, testutil.WaitMedium))

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "admin-logs-" + userID.String()[:8]})
	require.NoError(t, err)

	type fixture struct {
		tenantID uuid.UUID
		groupID  uuid.UUID
	}
	insert := func(name string, created time.Time, invalid bool) fixture {
		t.Helper()

		tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
			ID:               uuid.New(),
			Name:             name,
			Slug:             pgtype.Text{String: "admin-logs-" + uuid.NewString()[:8], Valid: true},
			IncludeInAll:     true,
			AvailableFormats: []string{},
		})
		require.NoError(t, err)

		serverID := uuid.New()
		_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: name + " server"})
		require.NoError(t, err)
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "UPDATE wow_servers SET tenant_id = $1 WHERE id = $2", tenant.ID, serverID)
		conn.Release()
		require.NoError(t, err)

		realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: serverID, Name: name + " realm"})
		require.NoError(t, err)

		groupID := uuid.New()
		_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: groupID, Owner: userID, LogType: database.LogTypeV1,
			CreatedAt: database.Timestamptz(created), UpdatedAt: database.Timestamptz(created),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, groupID))

		instanceID := uuid.New()
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realm.ID, LogGroupID: groupID, Name: name + " raid",
			HashedSlug: pgtype.Text{String: instanceID.String(), Valid: true},
			StartTime:  database.Timestamptz(created), EndTime: database.Timestamptz(created.Add(time.Hour)),
			Capabilities: []string{},
		})
		require.NoError(t, err)

		if invalid {
			require.NoError(t, store.InvalidateWoWLogGroup(ctx, database.InvalidateWoWLogGroupParams{LogGroupID: groupID, Reason: "test"}))
		}
		return fixture{tenantID: tenant.ID, groupID: groupID}
	}

	older := insert("Older Valid", time.Date(2025, time.January, 10, 12, 0, 0, 0, time.UTC), false)
	newerInvalid := insert("Newer Invalid", time.Date(2026, time.February, 5, 12, 0, 0, 0, time.UTC), true)

	base := database.ListAllWoWLogGroupsWithOwnerPaginatedParams{
		FilterUserID: uuid.Nil, FilterTenantID: uuid.Nil, FilterValidity: "all",
		SortBy: "date", SortOrder: "desc", LimitCount: 10,
	}

	tenantParams := base
	tenantParams.FilterTenantID = older.tenantID
	rows, err := store.ListAllWoWLogGroupsWithOwnerPaginated(ctx, tenantParams)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, older.groupID, rows[0].WoWLogGroup.ID)
	require.Equal(t, []interface{}{"Older Valid"}, rows[0].TenantNames)

	invalidParams := base
	invalidParams.FilterValidity = "invalid"
	rows, err = store.ListAllWoWLogGroupsWithOwnerPaginated(ctx, invalidParams)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, newerInvalid.groupID, rows[0].WoWLogGroup.ID)

	dateParams := base
	dateParams.CreatedFrom = pgtype.Timestamptz{Time: time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC), Valid: true}
	dateParams.CreatedBefore = pgtype.Timestamptz{Time: time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC), Valid: true}
	rows, err = store.ListAllWoWLogGroupsWithOwnerPaginated(ctx, dateParams)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, newerInvalid.groupID, rows[0].WoWLogGroup.ID)

	count, err := store.CountAllWoWLogGroups(ctx, database.CountAllWoWLogGroupsParams{
		FilterUserID: uuid.Nil, FilterTenantID: newerInvalid.tenantID, FilterValidity: "invalid",
	})
	require.NoError(t, err)
	require.Equal(t, int32(1), count)
}
