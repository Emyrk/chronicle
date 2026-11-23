package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestScoutingPayloadIndependentFreshness(t *testing.T) {
	t.Parallel()
	players := map[guid.GUID][]scouting.Player{1: {
		{Name: "Nearby", LastSeen: 30, Observations: []scouting.Observation{
			{At: 10, Name: "Nearby", Level: ptr.Ref(20), Guild: ptr.Ref("Old")},
			{At: 20, Name: "Nearby", Guild: ptr.Ref("")},
		}},
		{Name: "Nearby", LastSeen: 25, Observations: []scouting.Observation{
			{At: 15, Name: "Nearby", Level: ptr.Ref(21), Guild: ptr.Ref("Stale")},
		}},
	}}
	payload, err := scoutingPayload(newTestScouting(t, players), testScoutingRealms(players), time.Unix(1000, 0))
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1)
	row := rows[0]
	require.Equal(t, 21, *row.Level)
	require.Equal(t, int64(15), row.LevelObservedAt.Unix())
	require.Equal(t, "", *row.GuildName)
	require.True(t, row.GuildKnown)
	require.Equal(t, int64(20), row.GuildObservedAt.Unix())
	require.Equal(t, int64(30), row.ScoutingLastSeenAt.Unix())
	require.Nil(t, row.Race)
	require.Nil(t, row.Gender)
}

func TestScoutingPayloadThousandPlayers(t *testing.T) {
	t.Parallel()
	players := make(map[guid.GUID][]scouting.Player, 1000)
	for i := 1; i <= 1000; i++ {
		players[guid.GUID(i)] = []scouting.Player{{Name: fmt.Sprintf("Nearby%d", i), LastSeen: 20, Observations: []scouting.Observation{{At: 10, Name: fmt.Sprintf("Nearby%d", i)}}}}
	}
	payload, err := scoutingPayload(newTestScouting(t, players), testScoutingRealms(players), time.Unix(1000, 0))
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1000)
	require.Equal(t, guid.GUID(1).String(), rows[0].ID)
	require.Equal(t, guid.GUID(1000).String(), rows[999].ID)
}

type scoutingTestSource struct{ messages []messages.Message }

func (s scoutingTestSource) Advance(context.Context) ([]messages.Message, error) {
	return s.messages, io.EOF
}

func TestScoutingTimelineDoesNotBackfillFutureEvidence(t *testing.T) {
	t.Parallel()
	before := &messages.Unit{MessageBase: messages.Base(time.Unix(5, 0)), Info: unitinfo.Info{Guid: 1, Owner: ptr.Ref(guid.GUID(2))}}
	after := &messages.Unit{MessageBase: messages.Base(time.Unix(15, 0)), Info: unitinfo.Info{Guid: 1, CanCooperate: true}}
	known := &messages.Unit{MessageBase: messages.Base(time.Unix(25, 0)), Info: unitinfo.Info{Guid: 1, Name: "Combat", Level: 60}}
	realmID := uuid.New()
	source := scoutingAdvancer{realms: map[guid.GUID]uuid.UUID{1: realmID}, source: scoutingTestSource{messages: []messages.Message{before, after, known}}, players: newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Scout", LastSeen: 30, Observations: []scouting.Observation{
		{At: 10, Name: "Scout", Level: ptr.Ref(20), Guild: ptr.Ref("Ignored")},
		{At: 20, Name: "Later", Level: ptr.Ref(21)},
	}}}})}
	batch, err := source.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
	require.Empty(t, batch[0].(*messages.Unit).Name)
	require.Equal(t, *before.Owner, *batch[0].(*messages.Unit).Owner)
	middle := batch[1].(*messages.Unit)
	require.Equal(t, "Scout", middle.Name)
	require.Equal(t, int32(20), middle.Level)
	require.Equal(t, int64(10), middle.LevelObservedAt.Unix())
	require.True(t, middle.CanCooperate)
	require.Equal(t, "Combat", batch[2].(*messages.Unit).Name)
	require.Equal(t, int32(60), batch[2].(*messages.Unit).Level)
	require.Empty(t, after.Name, "must not mutate parser-owned message")
}

func TestScoutingArtifactLoaderPreservesOriginalsAndSkipsUnsupported(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	fixture, err := os.ReadFile("../combatlog/parser/forever/events/testdata/sidekick-events-v1.json")
	require.NoError(t, err)
	for key, data := range map[string][]byte{"valid.json": fixture, "future.json": []byte(`{"schema_version":99}`)} {
		_, err = objects.UploadFile(ctx, BucketRaidLogs, key, bytes.NewReader(data))
		require.NoError(t, err)
	}
	worker := WorkerLogParse{parent: &Chronicle{Storage: objects, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	players, err := worker.loadForeverScouting(ctx, []database.LogGroupArtifact{
		{Kind: ArtifactKindForeverEvents, ObjectKey: "valid.json"},
		{Kind: ArtifactKindForeverEvents, ObjectKey: "future.json"},
		{Kind: ArtifactKindForeverEvents, ObjectKey: "missing.json"},
		{Kind: "other", ObjectKey: "ignored"},
	})
	require.NoError(t, err)
	require.Equal(t, 2, players.Len())
	retained, err := objects.DownloadFile(ctx, BucketRaidLogs, "valid.json")
	require.NoError(t, err)
	require.Equal(t, fixture, retained)
	retained, err = objects.DownloadFile(ctx, BucketRaidLogs, "future.json")
	require.NoError(t, err)
	require.JSONEq(t, `{"schema_version":99}`, string(retained))
}

func newTestScouting(t *testing.T, players map[guid.GUID][]scouting.Player) *scouting.Scouting {
	t.Helper()
	var sources []scouting.Source
	for id, snapshots := range players {
		for _, snapshot := range snapshots {
			sources = append(sources, scouting.Source{Players: map[string]scouting.Player{id.String(): snapshot}})
		}
	}
	index, err := scouting.New(sources)
	require.NoError(t, err)
	return index
}

func testScoutingRealms(players map[guid.GUID][]scouting.Player) map[guid.GUID]uuid.UUID {
	realms := make(map[guid.GUID]uuid.UUID)
	realm := uuid.New()
	for id := range players {
		realms[id] = realm
	}
	return realms
}

func TestScoutingStaticCombatantAttributes(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	players := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Scout", Race: "NightElf", Gender: ptr.Ref(3), LastSeen: 30, Observations: []scouting.Observation{{At: 10, Name: "Scout"}}}}})
	for _, at := range []int64{5, 10, 20} {
		t.Run(fmt.Sprint(at), func(t *testing.T) {
			t.Parallel()
			raw := &messages.Combatant{MessageBase: messages.Base(time.Unix(at, 0)), Combatant: combatant.Combatant{Guid: 1, Name: "Scout", Seen: time.Unix(at, 0)}}
			source := scoutingAdvancer{players: players, realms: map[guid.GUID]uuid.UUID{1: realm}, source: scoutingTestSource{messages: []messages.Message{raw}}}
			batch, err := source.Advance(t.Context())
			require.ErrorIs(t, err, io.EOF)
			enriched := batch[0].(*messages.Combatant)
			require.Equal(t, types.HeroRacesNightElf, enriched.Race)
			require.Equal(t, types.HeroGenderFemale, enriched.Gender)
			require.Empty(t, raw.Race)
			tracker := armory.New(nil)
			tracker.Player(enriched)
			require.Empty(t, tracker.Players[1].Race)
			require.Equal(t, types.HeroGenderNotSet, tracker.Players[1].Gender)
			require.Nil(t, enriched.Guild)
			require.Nil(t, enriched.Faction)
		})
	}
	for _, tc := range []struct {
		name       string
		realm      uuid.UUID
		playerName string
		race       types.HeroRaces
		gender     types.HeroGender
	}{
		{"unresolved", uuid.Nil, "Scout", "", types.HeroGenderUnknown},
		{"mismatched", realm, "Other", "", types.HeroGenderUnknown},
		{"known", realm, "Scout", types.HeroRacesHuman, types.HeroGenderMale},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			raw := &messages.Combatant{Combatant: combatant.Combatant{Guid: 1, Name: tc.playerName, Race: tc.race, Gender: tc.gender}}
			source := scoutingAdvancer{players: players, realms: map[guid.GUID]uuid.UUID{1: tc.realm}, source: scoutingTestSource{messages: []messages.Message{raw}}}
			batch, _ := source.Advance(t.Context())
			require.Equal(t, raw, batch[0])
		})
	}
}

func TestScoutingStaticArmoryPersistence(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	ctx := t.Context()
	server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: t.Name()})
	require.NoError(t, err)
	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "realm"})
	require.NoError(t, err)
	persist := func(race string, gender int, lastSeen int64) {
		t.Helper()
		players := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Scout", Race: race, Gender: &gender, LastSeen: lastSeen}}})
		payload, err := scoutingPayload(players, map[guid.GUID]uuid.UUID{1: realm.ID}, time.Unix(1000, 0))
		require.NoError(t, err)
		_, err = db.UpsertScoutedPlayers(ctx, payload)
		require.NoError(t, err)
	}
	persist("", 1, 10) // Existing unknown row must be enriched on conflict too.
	persist("NightElf", 3, 20)
	persist("unsupported", 99, 30)
	row, err := db.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realm.ID, Identifier: 1})
	require.NoError(t, err)
	require.Equal(t, database.WowPlayableRaceNightElf, row.Race)
	require.Equal(t, database.WowPlayableGenderFemale, row.Gender)
	require.Equal(t, int64(20), row.RaceObservedAt.Time.Unix())
	require.Equal(t, int64(20), row.GenderObservedAt.Time.Unix())
}

func TestScoutingLastSeenFreshnessAndLogEnd(t *testing.T) {
	t.Parallel()
	// Historical logs use their own timestamps, never the wall clock at upload.
	lastSeen := time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC)
	observation := lastSeen.Add(-7 * 24 * time.Hour)
	realm := uuid.New()
	players := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Scout", Race: "Human", Gender: ptr.Ref(3), LastSeen: lastSeen.Unix(), Observations: []scouting.Observation{{At: observation.Unix(), Name: "Scout", Level: ptr.Ref(60), Guild: ptr.Ref("Guild")}}}}})
	boundary := lastSeen.Add(24 * time.Hour)
	before := &messages.Unit{MessageBase: messages.Base(observation.Add(-time.Second)), Info: unitinfo.Info{Guid: 1}}
	fresh := &messages.Unit{MessageBase: messages.Base(boundary), Info: unitinfo.Info{Guid: 1}}
	stale := &messages.Unit{MessageBase: messages.Base(boundary.Add(time.Second)), Info: unitinfo.Info{Guid: 1}}
	static := &messages.Combatant{MessageBase: messages.Base(boundary.Add(time.Second)), Combatant: combatant.Combatant{Guid: 1, Name: "Scout"}}
	source := &streamingScoutingSource{batches: [][]messages.Message{{before}, {fresh}, {stale, static}, {before}}}
	adv := scoutingAdvancer{players: players, realms: map[guid.GUID]uuid.UUID{1: realm}, source: source}
	batch, err := adv.Advance(t.Context())
	require.NoError(t, err)
	require.Empty(t, batch[0].(*messages.Unit).Name)
	batch, err = adv.Advance(t.Context())
	require.NoError(t, err)
	require.Equal(t, "Scout", batch[0].(*messages.Unit).Name)
	require.Equal(t, int32(60), batch[0].(*messages.Unit).Level)
	require.Equal(t, observation.Unix(), batch[0].(*messages.Unit).LevelObservedAt.Unix())
	batch, err = adv.Advance(t.Context())
	require.NoError(t, err)
	require.Empty(t, batch[0].(*messages.Unit).Name)
	require.Zero(t, batch[0].(*messages.Unit).Level)
	require.Equal(t, types.HeroRacesHuman, batch[1].(*messages.Combatant).Race)
	require.Equal(t, types.HeroGenderFemale, batch[1].(*messages.Combatant).Gender)
	_, err = adv.Advance(t.Context())
	require.NoError(t, err)
	require.Equal(t, boundary.Add(time.Second), adv.end, "end is maximum, not last processed timestamp")
	payload, err := scoutingPayload(players, adv.realms, boundary)
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Equal(t, 60, *rows[0].Level)
	require.Equal(t, observation.Unix(), rows[0].LevelObservedAt.Unix())
	payload, err = scoutingPayload(players, adv.realms, adv.end)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Nil(t, rows[0].Level)
	require.Nil(t, rows[0].NameObservedAt)
	require.Nil(t, rows[0].GuildObservedAt)
	require.False(t, rows[0].GuildKnown)
	require.Equal(t, "Scout", rows[0].Name, "static-only insert still has a reconciled identity label")
	require.Equal(t, "Human", *rows[0].Race)
	require.Equal(t, "Female", *rows[0].Gender)
}

func TestScoutingLastSeenDoesNotReplaceObservationClock(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	ctx := t.Context()
	server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: t.Name()})
	require.NoError(t, err)
	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "realm"})
	require.NoError(t, err)
	reference := time.Date(2020, 1, 10, 0, 0, 0, 0, time.UTC)
	persist := func(player scouting.Player, at time.Time) {
		t.Helper()
		index := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {player}})
		payload, err := scoutingPayload(index, map[guid.GUID]uuid.UUID{1: realm.ID}, at)
		require.NoError(t, err)
		_, err = db.UpsertScoutedPlayers(ctx, payload)
		require.NoError(t, err)
	}
	newerObservation := reference.Add(-time.Hour)
	persist(scouting.Player{Name: "Scout", LastSeen: reference.Unix(), Observations: []scouting.Observation{{At: newerObservation.Unix(), Name: "Scout", Level: ptr.Ref(60), Guild: ptr.Ref("Known")}}}, reference)
	// Older observation is still valid through its later LastSeen, but cannot
	// overwrite the database's independently newer observation.
	persist(scouting.Player{Name: "Scout", LastSeen: reference.Add(time.Hour).Unix(), Observations: []scouting.Observation{{At: reference.Add(-7 * 24 * time.Hour).Unix(), Name: "Scout", Level: ptr.Ref(10), Guild: ptr.Ref("")}}}, reference)
	// Expired fields and future observations must likewise not erase known state.
	persist(scouting.Player{Name: "Scout", Race: "Human", Gender: ptr.Ref(3), LastSeen: reference.Add(-25 * time.Hour).Unix(), Observations: []scouting.Observation{{At: reference.Add(-26 * time.Hour).Unix(), Level: ptr.Ref(20), Guild: ptr.Ref("")}}}, reference)
	persist(scouting.Player{Name: "Scout", LastSeen: reference.Add(time.Hour).Unix(), Observations: []scouting.Observation{{At: reference.Add(time.Hour).Unix(), Name: "Future", Level: ptr.Ref(30), Guild: ptr.Ref("")}}}, reference)
	row, err := db.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realm.ID, Identifier: 1})
	require.NoError(t, err)
	require.Equal(t, "Scout", row.Name)
	require.Equal(t, int16(60), row.Level)
	require.Equal(t, newerObservation.Unix(), row.LevelObservedAt.Time.Unix())
	require.Equal(t, newerObservation.Unix(), row.GuildObservedAt.Time.Unix())
	require.True(t, row.GuildID.Valid)
	require.Equal(t, database.WowPlayableRaceHuman, row.Race)
	require.Equal(t, database.WowPlayableGenderFemale, row.Gender)
}
