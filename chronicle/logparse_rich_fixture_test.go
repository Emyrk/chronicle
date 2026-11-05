package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
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

	// Persist the transported observations in a separate database. This
	// comparison covers player and loot rows with actual nonempty inputs; it
	// does not imply complete replacement-parse or whole-DB parity.
	require.NoError(t, fresh.store.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: fresh.logID, ParseGeneration: 1}))
	newID := uuid.New()
	require.NoError(t, fresh.store.InTx(ctx, func(tx database.Store) error {
		majority, err := InsertParsedArmory(ctx, tx, decoded.Armory, ParsedArmoryWrite{
			RealmID: fresh.realmID, RealmName: "Legacy Worker Realm", DatasetID: chron.defaultDatasetID,
			InstanceID: newID, InstanceStart: decoded.Core.Start,
		})
		if err != nil {
			return err
		}
		var guildID uuid.NullUUID
		if majority != nil {
			guildID = uuid.NullUUID{UUID: majority.ID, Valid: true}
		}
		_, err = InsertParsedCore(ctx, tx, decoded, ParsedCoreWrite{
			InstanceID: newID, RealmID: fresh.realmID, LogGroupID: fresh.logID,
			GuildID: guildID, ParserVersion: version.ExactParserVersion(),
		})
		if err != nil {
			return err
		}
		if err := InsertParsedEventStreams(ctx, tx, newID, decoded.Events); err != nil {
			return err
		}
		return InsertParsedLoot(ctx, tx, newID, fresh.realmID, decoded.Loot)
	}, nil))
	newPlayers, err := fresh.store.InstancePlayersByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.Len(t, newPlayers, len(players))
	players[0].InstanceID, newPlayers[0].InstanceID = uuid.Nil, uuid.Nil
	players[0].GuildID, newPlayers[0].GuildID = uuid.NullUUID{}, uuid.NullUUID{}
	assertPersistedParity(t, "player with guild and combatant", players, newPlayers)
	newLoot, err := fresh.store.GetInstanceLoot(ctx, database.GetInstanceLootParams{InstanceID: newID})
	require.NoError(t, err)
	require.Len(t, newLoot, len(loot))
	loot[0].ID, newLoot[0].ID = uuid.Nil, uuid.Nil
	loot[0].InstanceID, newLoot[0].InstanceID = uuid.Nil, uuid.Nil
	loot[0].RealmID, newLoot[0].RealmID = uuid.Nil, uuid.Nil
	assertPersistedParity(t, "loot with known player", loot, newLoot)
	oldPlayer, err := legacy.store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: legacy.realmID, Identifier: players[0].UnitGuid})
	require.NoError(t, err)
	newPlayer, err := fresh.store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: fresh.realmID, Identifier: newPlayers[0].UnitGuid})
	require.NoError(t, err)
	oldPlayer.RealmID, newPlayer.RealmID = uuid.Nil, uuid.Nil
	oldPlayer.GuildID, newPlayer.GuildID = uuid.NullUUID{}, uuid.NullUUID{}
	oldPlayer.CreatedAt, newPlayer.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	oldPlayer.UpdatedFromInstance, newPlayer.UpdatedFromInstance = uuid.NullUUID{}, uuid.NullUUID{}
	assertPersistedParity(t, "armory player", oldPlayer, newPlayer)

	oldEncounters, err := legacy.store.EncountersByInstanceID(ctx, rows[0].ID)
	require.NoError(t, err)
	newEncounters, err := fresh.store.EncountersByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.Len(t, oldEncounters, 1)
	require.Len(t, newEncounters, 1)
	oldEncID, newEncID := oldEncounters[0].ID.String(), newEncounters[0].ID.String()
	for _, kind := range database.AllLogInstanceEventTypeValues() {
		oldEvent, err := legacy.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: rows[0].ID, Type: string(kind)})
		require.NoError(t, err, "legacy %s", kind)
		newEvent, err := fresh.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: newID, Type: string(kind)})
		require.NoError(t, err, "data-only %s", kind)
		left := bytes.Replace(unzipEventRow(t, oldEvent.Events), []byte("$"+oldEncID), []byte("$"+uuid.Nil.String()), 1)
		right := bytes.Replace(unzipEventRow(t, newEvent.Events), []byte("$"+newEncID), []byte("$"+uuid.Nil.String()), 1)
		if kind == database.LogInstanceEventTypeUnitClassification {
			oldRecords, err := classificationEvents(left)
			require.NoError(t, err)
			newRecords, err := classificationEvents(right)
			require.NoError(t, err)
			assertPersistedParity(t, "player event "+string(kind), oldRecords, newRecords, cmp.Comparer(proto.Equal))
			continue
		}
		assertPersistedParity(t, "player event "+string(kind), left, right)
	}
}
