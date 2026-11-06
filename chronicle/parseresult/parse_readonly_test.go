package parseresult

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// A read-only PostgreSQL session must support all parse-time game-data reads.
// This tests statement-level read-only enforcement, not a separately granted
// least-privilege database role.
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
	for _, tc := range []struct {
		name   string
		format database.LogFormat
		flavor database.WoWFlavor
		log    string
		rich   bool
	}{
		{name: "vanilla", format: database.LogFormat112aCcAddon, log: strings.Join([]string{
			"1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309",
			"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0",
			"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0",
			"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0",
		}, "\n")},
		{name: "vanilla-rich", format: database.LogFormat112aCcAddon, rich: true, log: strings.Join([]string{
			"1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309",
			"1771564196050|UNIT_INFO|0xF1300039F2000001|0|Hakkar|0|||0||100000",
			"1771564196100|UNIT_INFO|0x000000000001C80A|1|PriestOne|1|||60||3117",
			"1771564196200|COMBATANT_INFO|0x000000000001C80A|PriestOne|PRIEST|Human|3|Test Guild|Member|1|123456:0:0:0||nil|nil",
			"1771564197000|SWING|0x000000000001C80A|0xF1300039F2000001|194|2|1|1|0|0|0",
			"1771564200000|SWING|0x000000000001C80A|0xF1300039F2000001|194|2|1|1|0|0|0",
			"1771564200100|DEATH|0xF1300039F2000001",
			"1771564200200|LOOT|PriestOne||cffffffff|Hitem:14047:0:0:0|h[Runecloth]|h|r",
			"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0",
		}, "\n")},
		{name: "tbc", format: database.LogFormat243CcAddon, flavor: database.WoWFlavor{database.FlavorTBC},
			log: cleuNightbaneLog("250,1,5,0,10,1,nil,nil")},
		{name: "wrath", format: database.LogFormat335aCcAddon, flavor: database.WoWFlavor{database.FlavorWrath},
			log: cleuNightbaneLog("250,0,1,0,0,0,nil,nil,nil")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reg := registry.RegistryForFlavor(logger, tc.flavor)
			parseCtx := parsectx.With(ctx, parsectx.Context{Format: tc.format, Flavor: tc.flavor, DatasetID: datasetID})
			results, err := Parse(parseCtx, strings.NewReader(tc.log), gameDB.ForDataset(datasetID), reg, logger)
			require.NoError(t, err)
			require.Len(t, results, 1)
			require.Equal(t, tc.format, results[0].Format)
			require.Equal(t, 8, results[0].SchemaVersion)
			require.Equal(t, tc.flavor, results[0].Flavor)
			require.Equal(t, datasetID, results[0].DatasetID)
			require.NotEmpty(t, results[0].Events.Damage)
			if tc.rich {
				require.NotEmpty(t, results[0].Armory.Players)
				require.NotEmpty(t, results[0].Armory.Players[0].Gear)
				require.NotEmpty(t, results[0].Loot)
				require.NotEmpty(t, results[0].BossRankings.Encounters)
				require.NotEmpty(t, results[0].BossRankings.Encounters[0].Units)
			}
		})
	}
}

func cleuNightbaneLog(suffix string) string {
	return strings.Join([]string{
		`8/8 18:43:42.478  SWING_DAMAGE,0x0000000000000001,"Raider",0x511,0xF1300043490001E0,"Nightbane",0x10a48,` + suffix,
		`8/8 18:43:44.478  SWING_DAMAGE,0x0000000000000001,"Raider",0x511,0xF1300043490001E0,"Nightbane",0x10a48,` + suffix,
	}, "\n")
}
