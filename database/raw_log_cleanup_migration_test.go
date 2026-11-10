package database_test

import (
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestRawLogCleanupMigrationDefaults(t *testing.T) {
	t.Parallel()
	connectionURL := dbtestutil.NewConnectionURL(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	// Connect as the database owner to apply DDL, rather than the app role.
	pool, err := pgxpool.New(ctx, connectionURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)
	cutoff := time.Date(2026, time.November, 1, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name      string
		createdAt pgtype.Timestamptz
		enabled   bool
		id        uuid.UUID
	}{
		{name: "before cutoff", createdAt: database.Timestamptz(cutoff.Add(-time.Microsecond)), enabled: false},
		{name: "at cutoff", createdAt: database.Timestamptz(cutoff), enabled: true},
		{name: "after cutoff", createdAt: database.Timestamptz(cutoff.Add(time.Hour)), enabled: true},
		{name: "unknown creation date", enabled: false},
	}
	for i := range cases {
		cases[i].id = uuid.New()
		_, err := store.InsertUser(ctx, database.InsertUserParams{
			ID: cases[i].id, Username: cases[i].id.String(), Email: cases[i].id.String() + "@example.com",
			CreatedAt: cases[i].createdAt,
		})
		require.NoError(t, err)
	}

	// Recreate the pre-feature schema with populated accounts, then apply the
	// actual migration. Execute migration files, not a duplicate of their SQL.
	for _, direction := range []string{"down", "up"} {
		script, err := os.ReadFile("migrations/000362_auto_delete_raw_logs_at_storage_capacity." + direction + ".sql")
		require.NoError(t, err)
		_, err = pool.Exec(ctx, string(script))
		require.NoError(t, err)
	}
	for _, tc := range cases {
		user, err := store.GetUserByID(ctx, tc.id)
		require.NoError(t, err)
		require.Equal(t, tc.enabled, user.AutoDeleteRawLogsAtStorageCapacity, tc.name)
	}

	// New inserts use the column default, not the historical cutoff, even if
	// the caller omits the optional creation timestamp.
	id := uuid.New()
	user, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: id, Username: id.String(), Email: id.String() + "@example.com",
	})
	require.NoError(t, err)
	require.True(t, user.AutoDeleteRawLogsAtStorageCapacity)
}
