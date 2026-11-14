package main

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type structureFixture struct {
	data       structureData
	instance   uuid.UUID
	encounters map[uuid.UUID]string
}

func newStructureFixture() structureFixture {
	instance, encounter, guild := uuid.New(), uuid.New(), uuid.New()
	timestamp := time.Date(2025, 1, 2, 3, 4, 5, 123456789, time.UTC)
	f := structureFixture{instance: instance, encounters: map[uuid.UUID]string{encounter: "instance/0/encounter/0"}, data: structureData{
		Units:     []database.LogInstanceUnit{{InstanceID: instance, UnitGuid: guid.GUID(123), Name: "hostile", Entry: 123}, {InstanceID: instance, UnitGuid: guid.GUID(789), Name: "pet", Entry: 789}},
		Players:   []database.LogInstancePlayer{{InstanceID: instance, UnitGuid: guid.GUID(456), Name: "player", Level: 60, Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman, GuildID: uuid.NullUUID{UUID: guild, Valid: true}}},
		Hostiles:  []database.LogInstanceEncounterHostile{{EncounterID: encounter, ID: guid.GUID(123), Boss: true, Periods: database.Periods{{Start: &database.PeriodMoment{Timestamp: timestamp, Reason: "start", Message: []byte(`{"amount":9007199254740993}`)}, End: &database.PeriodMoment{Timestamp: timestamp.Add(time.Second), Reason: "end"}, EndState: database.EndStateSlain}}}},
		Phases:    []database.LogInstanceEncounterPhase{{ID: uuid.New(), EncounterID: encounter, Key: "phase-1", Name: "First phase", PhaseOrder: 1, StartOffsetMs: 1234, EndOffsetMs: 5678, KillType: database.KillTypeClean}},
		Snapshots: []database.InstanceRaidGroupSnapshotsRow{{ID: uuid.New(), InstanceID: instance, EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, SnapshotType: database.RaidGroupSnapshotTypeCleanKill, ObservedAt: database.Timestamptz(timestamp)}},
		Guilds:    []database.Guild{{ID: guild, RealmID: dbstatic.RealmNordanaar(), Name: "guild"}},
	}}
	f.data.Snapshots[0].Composition[0][0] = guid.GUID(456)
	return f
}
func (f structureFixture) canonical(t *testing.T) structureOutput {
	t.Helper()
	out, err := canonicalStructure(f.data, f.instance, "instance/0", f.encounters)
	require.NoError(t, err)
	return out
}
func TestStructureCanonicalization(t *testing.T) {
	t.Parallel()
	first, second := newStructureFixture(), newStructureFixture()
	second.data.Units[0], second.data.Units[1] = second.data.Units[1], second.data.Units[0]
	baseline := jsonBytes(t, first.canonical(t))
	require.Equal(t, baseline, jsonBytes(t, second.canonical(t)))
	require.Contains(t, string(baseline), `9007199254740993`)
	require.Contains(t, string(baseline), `123456789Z`)
	for name, change := range map[string]func(*structureFixture){
		"unit entry":   func(f *structureFixture) { f.data.Units[0].Entry++ },
		"player level": func(f *structureFixture) { f.data.Players[0].Level-- },
		"player guild": func(f *structureFixture) { f.data.Guilds[0].Name = "other" },
		"hostile moment": func(f *structureFixture) {
			f.data.Hostiles[0].Periods[0].Start.Timestamp = f.data.Hostiles[0].Periods[0].Start.Timestamp.Add(time.Nanosecond)
		},
		"hostile evidence": func(f *structureFixture) {
			f.data.Hostiles[0].Periods[0].Start.Message = []byte(`{"amount":9007199254740994}`)
		},
		"phase duration": func(f *structureFixture) { f.data.Phases[0].EndOffsetMs++ },
		"phase order":    func(f *structureFixture) { f.data.Phases[0].PhaseOrder++ },
		"snapshot slot": func(f *structureFixture) {
			f.data.Snapshots[0].Composition[0][0] = 0
			f.data.Snapshots[0].Composition[0][1] = 456
		},
		"snapshot timestamp": func(f *structureFixture) {
			f.data.Snapshots[0].ObservedAt.Time = f.data.Snapshots[0].ObservedAt.Time.Add(time.Nanosecond)
		},
		"missing player": func(f *structureFixture) { f.data.Players = nil },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newStructureFixture()
			change(&f)
			require.NotEqual(t, baseline, jsonBytes(t, f.canonical(t)))
		})
	}
}
func TestStructureReferences(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(*structureFixture){
		"missing guild": func(f *structureFixture) { f.data.Guilds = nil },
		"ambiguous guild": func(f *structureFixture) {
			other := f.data.Guilds[0]
			other.ID = uuid.New()
			f.data.Guilds = append(f.data.Guilds, other)
		},
		"missing encounter": func(f *structureFixture) { f.encounters = nil },
		"cross instance":    func(f *structureFixture) { f.data.Units[0].InstanceID = uuid.New() },
		"cross encounter": func(f *structureFixture) {
			for id := range f.encounters {
				f.encounters[id] = "instance/1/encounter/0"
			}
		},
		"ambiguous phase": func(f *structureFixture) {
			other := f.data.Phases[0]
			other.ID = uuid.New()
			f.data.Phases = append(f.data.Phases, other)
		},
		"ambiguous snapshot": func(f *structureFixture) {
			other := f.data.Snapshots[0]
			other.ID = uuid.New()
			f.data.Snapshots = append(f.data.Snapshots, other)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newStructureFixture()
			change(&f)
			_, err := canonicalStructure(f.data, f.instance, "instance/0", f.encounters)
			require.Error(t, err)
		})
	}
}
func TestLogGroupSemanticFlavor(t *testing.T) {
	t.Parallel()
	group := database.WoWLogGroup{ID: uuid.New(), LogType: database.LogTypeAzerothcore, Flavor: []string{"azerothcore"}}
	baseline, err := logGroupValues(group)
	require.NoError(t, err)
	group.ID = uuid.New()
	group.CreatedAt = database.Timestamptz(time.Now())
	group.ParseGeneration = 12
	same, err := logGroupValues(group)
	require.NoError(t, err)
	require.Equal(t, jsonBytes(t, baseline), jsonBytes(t, same))
	group.Flavor = []string{"turtle"}
	changed, err := logGroupValues(group)
	require.NoError(t, err)
	require.NotEqual(t, jsonBytes(t, baseline), jsonBytes(t, changed))
}
func TestStructureScopedQueries(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	group := seedGroup(t, ctx, db)
	require.NoError(t, db.InsertParsedLogGroup(ctx, group))
	f := newStructureFixture()
	var encounter uuid.UUID
	for id := range f.encounters {
		encounter = id
	}
	now := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	_, err := db.InsertInstance(ctx, database.InsertInstanceParams{ID: f.instance, LogGroupID: group, RealmID: dbstatic.RealmNordanaar(), Name: "raid", StartTime: now, EndTime: now, Capabilities: []string{}, Versions: database.VersionsMap{}})
	require.NoError(t, err)
	_, err = db.InsertEncounter(ctx, database.InsertEncounterParams{ID: encounter, InstanceID: f.instance, Name: "boss", StartTime: now, EndTime: now, KillType: database.KillTypeClean, Remaining: guid.GUIDs{}})
	require.NoError(t, err)
	guild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: dbstatic.RealmNordanaar(), Name: "guild", CreatedAt: now})
	require.NoError(t, err)
	require.NoError(t, db.InsertInstanceUnits(ctx, []database.InsertInstanceUnitsParams{{InstanceID: f.instance, UnitGuid: 123, Name: "hostile", Entry: 123}}).Close())
	require.NoError(t, db.InsertInstancePlayers(ctx, []database.InsertInstancePlayersParams{{InstanceID: f.instance, UnitGuid: 456, Name: "player", Level: 60, Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true}}}).Close())
	require.NoError(t, db.InsertEncounterCharacterFights(ctx, []database.InsertEncounterCharacterFightsParams{{EncounterID: encounter, ID: 123, Boss: true, Periods: f.data.Hostiles[0].Periods}}).Close())
	require.NoError(t, db.InsertEncounterPhase(ctx, database.InsertEncounterPhaseParams{ID: uuid.New(), EncounterID: encounter, Key: "phase-1", Name: "First phase", PhaseOrder: 1, StartOffsetMs: 1234, EndOffsetMs: 5678, KillType: database.KillTypeClean}))
	require.NoError(t, db.InsertInstanceRaidGroupSnapshot(ctx, database.InsertInstanceRaidGroupSnapshotParams{InstanceID: f.instance, EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, SnapshotType: database.RaidGroupSnapshotTypeCleanKill, ObservedAt: now, Composition: f.data.Snapshots[0].Composition}))
	loaded, err := loadStructure(ctx, db, f.instance)
	require.NoError(t, err)
	require.Len(t, loaded.Units, 1)
	require.Len(t, loaded.Players, 1)
	require.Len(t, loaded.Hostiles, 1)
	require.Len(t, loaded.Phases, 1)
	require.Len(t, loaded.Snapshots, 1)
	require.Len(t, loaded.Guilds, 1)
	out, err := canonicalStructure(loaded, f.instance, "instance/0", f.encounters)
	require.NoError(t, err)
	require.Contains(t, string(jsonBytes(t, out)), `9007199254740993`)
	empty, err := loadStructure(ctx, db, uuid.New())
	require.NoError(t, err)
	require.Empty(t, empty.Units)
	require.Empty(t, empty.Players)
	require.Empty(t, empty.Hostiles)
	require.Empty(t, empty.Phases)
	require.Empty(t, empty.Snapshots)
	require.Empty(t, empty.Guilds)
}
