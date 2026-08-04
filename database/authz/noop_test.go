package authz_test

import (
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestNewDatabaseOnly(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	db, _ := dbtestutil.NewDB(t)
	logger := slog.Default()

	z := authz.NewDatabaseOnly(logger, db)
	require.NotNil(t, z)

	// Verify the wrapper delegates queries to the underlying store.
	_, err := z.Ping(ctx)
	require.NoError(t, err)
}

func TestNewDatabaseOnly_NoSpiceDB(t *testing.T) {
	t.Parallel()

	db, _ := dbtestutil.NewDB(t)
	logger := slog.Default()

	z := authz.NewDatabaseOnly(logger, db)

	// Calling Close should not panic even though there is no SpiceDB client.
	err := z.Close()
	require.NoError(t, err)
}

func TestNewDatabaseOnly_QueryPassthrough(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	db, _ := dbtestutil.NewDB(t)
	logger := slog.Default()

	z := authz.NewDatabaseOnly(logger, db)

	// Verify a simple query works through the passthrough wrapper.
	// CountUserAuthLinks is a simple query that should work on an empty DB.
	count, err := z.CountUserAuthLinks(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(0), count)
}
