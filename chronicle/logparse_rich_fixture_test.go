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

// Keep a nonempty fixture separate from the minimal initial/replacement test.
// This compares the persisted core, event, guild, player and loot rows from a
// real initial worker parse with independent data-only adapters. It does not
// establish whole-DB or rich replacement-parse parity.
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
	oldInstance, err := legacy.store.GetLogInstanceForDiscordAnnouncement(ctx, rows[0].ID)
	require.NoError(t, err)
	newInstance, err := fresh.store.GetLogInstanceForDiscordAnnouncement(ctx, newID)
	require.NoError(t, err)
	require.True(t, oldInstance.GuildID.Valid)
	require.True(t, newInstance.GuildID.Valid)
	oldGuildID, newGuildID := oldInstance.GuildID.UUID, newInstance.GuildID.UUID
	oldGuild, err := legacy.store.GetGuildByID(ctx, oldGuildID)
	require.NoError(t, err)
	newGuild, err := fresh.store.GetGuildByID(ctx, newInstance.GuildID.UUID)
	require.NoError(t, err)
	oldGuild.ID, newGuild.ID = uuid.Nil, uuid.Nil
	oldGuild.RealmID, newGuild.RealmID = uuid.Nil, uuid.Nil
	oldGuild.CreatedAt, newGuild.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "armory guild", oldGuild, newGuild)

	oldInstance.ID, newInstance.ID = uuid.Nil, uuid.Nil
	oldInstance.RealmID, newInstance.RealmID = uuid.Nil, uuid.Nil
	oldInstance.LogGroupID, newInstance.LogGroupID = uuid.Nil, uuid.Nil
	oldInstance.GuildID, newInstance.GuildID = uuid.NullUUID{}, uuid.NullUUID{}
	oldInstance.HashedSlug, newInstance.HashedSlug = pgtype.Text{}, pgtype.Text{}
	oldInstance.UpdatedAt, newInstance.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "rich instance", oldInstance, newInstance)

	oldOverview, err := legacy.store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: rows[0].ID, MetricsVersion: decoded.Overview.MetricsVersion})
	require.NoError(t, err)
	newOverview, err := fresh.store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: newID, MetricsVersion: decoded.Overview.MetricsVersion})
	require.NoError(t, err)
	oldOverview.InstanceID, newOverview.InstanceID = uuid.Nil, uuid.Nil
	oldOverview.CreatedAt, newOverview.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	oldOverview.UpdatedAt, newOverview.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	assertPersistedParity(t, "rich overview", oldOverview, newOverview)

	oldEncounters, err := legacy.store.EncountersByInstanceID(ctx, rows[0].ID)
	require.NoError(t, err)
	newEncounters, err := fresh.store.EncountersByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.Len(t, oldEncounters, 1)
	require.Len(t, newEncounters, 1)
	oldEncID, newEncID := oldEncounters[0].ID.String(), newEncounters[0].ID.String()
	oldEncounters[0].ID, newEncounters[0].ID = uuid.Nil, uuid.Nil
	oldEncounters[0].InstanceID, newEncounters[0].InstanceID = uuid.Nil, uuid.Nil
	assertPersistedParity(t, "rich encounter", oldEncounters, newEncounters)

	oldFights, err := legacy.store.GetInstanceEncounterCharacterFights(ctx, rows[0].ID)
	require.NoError(t, err)
	newFights, err := fresh.store.GetInstanceEncounterCharacterFights(ctx, newID)
	require.NoError(t, err)
	require.NotEmpty(t, oldFights)
	require.Len(t, newFights, len(oldFights))
	for i := range oldFights {
		oldFights[i].EncounterID, newFights[i].EncounterID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "rich hostile fights", oldFights, newFights)

	oldPhases, err := legacy.store.GetEncounterPhasesByInstanceID(ctx, rows[0].ID)
	require.NoError(t, err)
	newPhases, err := fresh.store.GetEncounterPhasesByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.Len(t, newPhases, len(oldPhases))
	for i := range oldPhases {
		oldPhases[i].ID, newPhases[i].ID = uuid.Nil, uuid.Nil
		oldPhases[i].EncounterID, newPhases[i].EncounterID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "rich phases", oldPhases, newPhases)

	oldSnapshots, err := legacy.store.InstanceRaidGroupSnapshots(ctx, rows[0].ID)
	require.NoError(t, err)
	newSnapshots, err := fresh.store.InstanceRaidGroupSnapshots(ctx, newID)
	require.NoError(t, err)
	require.Len(t, newSnapshots, len(oldSnapshots))
	for i := range oldSnapshots {
		oldSnapshots[i].ID, newSnapshots[i].ID = uuid.Nil, uuid.Nil
		oldSnapshots[i].InstanceID, newSnapshots[i].InstanceID = uuid.Nil, uuid.Nil
		require.Equal(t, oldSnapshots[i].EncounterID.Valid, newSnapshots[i].EncounterID.Valid)
		if oldSnapshots[i].EncounterID.Valid {
			require.Equal(t, oldEncID, oldSnapshots[i].EncounterID.UUID.String())
			require.Equal(t, newEncID, newSnapshots[i].EncounterID.UUID.String())
		}
		oldSnapshots[i].EncounterID, newSnapshots[i].EncounterID = uuid.NullUUID{}, uuid.NullUUID{}
	}
	assertPersistedParity(t, "rich raid snapshots", oldSnapshots, newSnapshots)

	oldUnits, err := legacy.store.InstanceUnitsByInstanceID(ctx, rows[0].ID)
	require.NoError(t, err)
	newUnits, err := fresh.store.InstanceUnitsByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.NotEmpty(t, oldUnits)
	require.Len(t, newUnits, len(oldUnits))
	for i := range oldUnits {
		oldUnits[i].InstanceID, newUnits[i].InstanceID = uuid.Nil, uuid.Nil
	}
	assertPersistedParity(t, "rich units", oldUnits, newUnits)

	newPlayers, err := fresh.store.InstancePlayersByInstanceID(ctx, newID)
	require.NoError(t, err)
	require.Len(t, newPlayers, len(players))
	// Instance participant guild_id can be absent even when the separate
	// armory player and instance have a resolved majority guild.
	require.Equal(t, players[0].GuildID.Valid, newPlayers[0].GuildID.Valid)
	if players[0].GuildID.Valid {
		require.Equal(t, oldGuildID, players[0].GuildID.UUID)
		require.Equal(t, newGuildID, newPlayers[0].GuildID.UUID)
	}
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
	require.True(t, oldPlayer.GuildID.Valid)
	require.True(t, newPlayer.GuildID.Valid)
	require.Equal(t, oldGuildID, oldPlayer.GuildID.UUID)
	require.Equal(t, newGuildID, newPlayer.GuildID.UUID)
	require.Equal(t, oldPlayer.UpdatedFromInstance.Valid, newPlayer.UpdatedFromInstance.Valid)
	oldPlayer.RealmID, newPlayer.RealmID = uuid.Nil, uuid.Nil
	oldPlayer.GuildID, newPlayer.GuildID = uuid.NullUUID{}, uuid.NullUUID{}
	oldPlayer.CreatedAt, newPlayer.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	oldPlayer.UpdatedFromInstance, newPlayer.UpdatedFromInstance = uuid.NullUUID{}, uuid.NullUUID{}
	assertPersistedParity(t, "armory player", oldPlayer, newPlayer)

	for _, kind := range database.AllLogInstanceEventTypeValues() {
		oldEvent, err := legacy.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: rows[0].ID, Type: string(kind)})
		require.NoError(t, err, "legacy %s", kind)
		newEvent, err := fresh.store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: newID, Type: string(kind)})
		require.NoError(t, err, "data-only %s", kind)
		left := unzipEventRow(t, oldEvent.Events)
		right := unzipEventRow(t, newEvent.Events)
		require.True(t, bytes.Contains(left, []byte("$"+oldEncID)), "legacy %s header", kind)
		require.True(t, bytes.Contains(right, []byte("$"+newEncID)), "data-only %s header", kind)
		left = bytes.Replace(left, []byte("$"+oldEncID), []byte("$"+uuid.Nil.String()), 1)
		right = bytes.Replace(right, []byte("$"+newEncID), []byte("$"+uuid.Nil.String()), 1)
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
