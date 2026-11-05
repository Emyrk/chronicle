package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

// Keep a second, nonempty fixture separate from the minimal persisted-row
// comparison. This tests that the real worker and independent parser both
// reach the guild, participant, armory, and loot paths; their full database
// write parity is not established by this test.
func TestLegacyAndDataOnlyParseProjectPlayerGuildAndLoot(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	raw := []byte("1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309\n" +
		"1771564196100|UNIT_INFO|0x000000000001C80A|1|PriestOne|1|||60||3117\n" +
		"1771564196200|COMBATANT_INFO|0x000000000001C80A|PriestOne|PRIEST|Human|3|Test Guild|Member|1|||nil|nil\n" +
		"1771564197000|SWING|0x000000000001C80A|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564200000|SWING|0x000000000001C80A|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564200100|LOOT|PriestOne||cffffffff|Hitem:14047:0:0:0|h[Runecloth]|h|r\n" +
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0\n")
	legacy := newLegacyWorkerFixtureWithLog(t, ctx, raw)
	fresh := newLegacyWorkerFixtureWithLog(t, ctx, raw, false)
	require.NoError(t, legacy.worker.Work(ctx, &river.Job[ArgsLogParse]{
		Args:   ArgsLogParse{LogID: legacy.logID, RealmID: legacy.realmID, ParseGeneration: 1},
		JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 2},
	}))
	rows, err := legacy.store.GetInstancesByLogGroupID(ctx, legacy.logID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	players, err := legacy.store.InstancePlayersByInstanceID(ctx, rows[0].ID)
	require.NoError(t, err)
	require.Len(t, players, 1)
	require.Equal(t, "PriestOne", players[0].Name)
	require.Equal(t, int32(60), players[0].Level)
	loot, err := legacy.store.GetInstanceLoot(ctx, database.GetInstanceLootParams{InstanceID: rows[0].ID})
	require.NoError(t, err)
	require.Len(t, loot, 1)
	require.Equal(t, int32(14047), loot[0].ItemID)

	chron := fresh.worker.parent
	results, err := parseresult.Parse(ctx, bytes.NewReader(raw), chron.WoWDB.ForDataset(chron.defaultDatasetID), chron.Registry(), chron.logger)
	require.NoError(t, err)
	require.Len(t, results, 1)
	encoded, err := json.Marshal(results[0])
	require.NoError(t, err)
	var decoded parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.Len(t, decoded.Armory.Guilds, 1)
	require.Equal(t, "Test Guild", decoded.Armory.Guilds[0].Name)
	require.Len(t, decoded.Armory.Players, 1)
	require.Equal(t, players[0].Name, decoded.Armory.Players[0].Name)
	require.Equal(t, int16(players[0].Level), decoded.Armory.Players[0].Level)
	require.NotEmpty(t, decoded.Units)
	require.Len(t, decoded.Loot, 1)
	require.Equal(t, loot[0].ItemID, decoded.Loot[0].ItemID)
}
