package parseresult

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// The independent parser must be able to fetch its spell/creature catalog
// through PostgreSQL without obtaining database write privileges.
func TestParseWithReadOnlyPostgres(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	config := pool.Config().Copy()
	config.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	readonly, err := pgxpool.NewWithConfig(ctx, config)
	require.NoError(t, err)
	t.Cleanup(readonly.Close)
	var readOnlySetting string
	require.NoError(t, readonly.QueryRow(ctx, "SHOW default_transaction_read_only").Scan(&readOnlySetting))
	require.Equal(t, "on", readOnlySetting)
	// This is a test-only privilege check, not a database query used by the
	// parser. PostgreSQL must refuse writes through this pool.
	_, err = readonly.Exec(ctx, "CREATE TEMP TABLE parseresult_readonly_probe (id integer)")
	require.Error(t, err)

	datasetID := uuid.New()
	gameDB, err := gamedb.New(ctx, gamedb.Options{DB: database.New(readonly), Pool: readonly, DatasetID: datasetID})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, gameDB.Close()) })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := registry.RegistryForFlavor(logger, database.WoWFlavor{})
	log := strings.Join([]string{
		"1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309",
		"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0",
		"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0",
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0",
	}, "\n")
	results, err := Parse(ctx, strings.NewReader(log), gameDB.ForDataset(datasetID), reg, logger)
	require.NoError(t, err)
	require.Len(t, results, 1)
	require.NotEmpty(t, results[0].Events.Damage)
}
