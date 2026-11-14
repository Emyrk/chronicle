package authz_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestDatabaseOnlyTransactionRelations(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	z := authz.NewDatabaseOnly(slog.Default(), db)
	for _, rollback := range []bool{false, true} {
		name := uuid.NewString()
		sentinel := errors.New("rollback requested")
		var guildID uuid.UUID
		err := z.InTx(ctx, func(tx *authz.AuthzTX) error {
			// This interceptor writes a guild relation through AuthzTX, not the
			// constructor's top-level noop interceptor.
			guild, err := tx.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: dbstatic.RealmNordanaar(), Name: name, CreatedAt: database.Timestamptz(time.Now())})
			if err != nil {
				return err
			}
			guildID = guild.ID
			if rollback {
				return sentinel
			}
			return nil
		}, nil)
		if rollback {
			require.ErrorIs(t, err, sentinel)
		} else {
			require.NoError(t, err)
		}
		_, readErr := db.GetGuildByID(ctx, guildID)
		if rollback {
			require.ErrorIs(t, readErr, pgx.ErrNoRows)
		} else {
			require.NoError(t, readErr)
		}
	}
	// Direct database-only relationship operations must also avoid SpiceDB.
	_, err := z.Write(context.Background(), rel.Txn{})
	require.NoError(t, err)
	require.NoError(t, z.Delete(context.Background(), nil))
}

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
