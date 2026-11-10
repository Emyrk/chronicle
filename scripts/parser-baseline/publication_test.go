package main

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type publicationFixture struct {
	data      publicationData
	instances []database.LogInstancesGuild
	keys      map[uuid.UUID]string
}

func newPublicationFixture() publicationFixture {
	instance, guild := uuid.New(), uuid.New()
	realm := dbstatic.RealmNordanaar()
	now := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	nullableGuild := uuid.NullUUID{UUID: guild, Valid: true}
	outfit := database.PlayerOutfit{}
	outfit[0].ItemID = 12345
	return publicationFixture{
		instances: []database.LogInstancesGuild{{ID: instance, RealmID: realm, GuildID: nullableGuild}}, keys: map[uuid.UUID]string{instance: "instance/0"},
		data: publicationData{
			Guilds:    []database.Guild{{ID: guild, RealmID: realm, Name: "guild"}},
			Players:   []database.GamePlayer{{ID: 123, RealmID: realm, GuildID: nullableGuild, Name: "player", Gear: &outfit, UpdatedAt: now, UpdatedFromInstance: uuid.NullUUID{UUID: instance, Valid: true}, Level: 60}},
			Gear:      []database.GamePlayerGearHistory{{PlayerID: 123, RealmID: realm, InstanceID: instance, Gear: outfit, AvgIlvl: pgtype.Float4{Float32: 51.25, Valid: true}, EquippedAt: now}},
			Loot:      []database.InstanceLoot{{ID: uuid.New(), InstanceID: instance, RealmID: realm, SourceGuid: 9007199254740993, SourceTs: now, ReceivedGuid: 123, ReceivedTs: now, ItemID: 12345, ItemName: "item", Quantity: 1}},
			Overview:  []database.InstanceOverviewMetric{{InstanceID: instance, PlayerDeaths: 1, WipeCount: 2, EncounterSpanDurationMs: 12345, TotalCombatDurationMs: 6789, TotalBossDurationMs: 1234, MetricsVersion: 3, TopIncomingDamageAbilities: []database.OverviewIncomingDamageAbility{{Name: "spell", Damage: 9007199254740993, Hits: 5}}}},
			Speedruns: []database.InstanceSpeedrun{{InstanceID: instance, InstanceName: "raid", RealmID: realm, GuildID: nullableGuild, Qualified: true, StartTime: now, CompletionTime: now, DurationMs: 12345, RankedStartTime: now, RankedCompletionTime: now, RankedDurationMs: pgtype.Int8{Int64: 1234, Valid: true}, BossToBossStartTime: now, BossToBossCompletionTime: now, BossToBossDurationMs: pgtype.Int8{Int64: 5678, Valid: true}, Proof: []byte(`{"proof":[{"kills":[{"timestamp":"2025-01-02T03:04:05.123456789Z","guid":"0x123"}],"satisfied":true}],"evidence":9007199254740993}`)}},
		},
	}
}
func (f publicationFixture) canonical(t *testing.T) publicationOutput {
	t.Helper()
	out, _, err := canonicalPublication(f.data, f.instances, f.keys)
	require.NoError(t, err)
	return out
}
func TestPublicationCanonicalIdentityAndEvidence(t *testing.T) {
	t.Parallel()
	a, b := newPublicationFixture(), newPublicationFixture()
	b.data.Guilds[0].CreatedAt = database.Timestamptz(time.Now())
	b.data.Players[0].CreatedAt = database.Timestamptz(time.Now())
	b.data.Gear[0].CreatedAt = database.Timestamptz(time.Now())
	b.data.Overview[0].UpdatedAt = database.Timestamptz(time.Now())
	b.data.Speedruns[0].CreatedAt = database.Timestamptz(time.Now())
	baseline := jsonBytes(t, a.canonical(t))
	require.Equal(t, baseline, jsonBytes(t, b.canonical(t)))
	require.Contains(t, string(baseline), `9007199254740993`)
	require.Contains(t, string(baseline), `123456789Z`)
	for name, change := range map[string]func(*publicationFixture){
		"guild name":  func(f *publicationFixture) { f.data.Guilds[0].Name = "other" },
		"player gear": func(f *publicationFixture) { f.data.Players[0].Gear[0].ItemID++ },
		"player observation": func(f *publicationFixture) {
			f.data.Players[0].UpdatedAt.Time = f.data.Players[0].UpdatedAt.Time.Add(time.Microsecond)
		},
		"equipped observation": func(f *publicationFixture) {
			f.data.Gear[0].EquippedAt.Time = f.data.Gear[0].EquippedAt.Time.Add(time.Microsecond)
		},
		"loot quantity": func(f *publicationFixture) { f.data.Loot[0].Quantity++ },
		"loot received time": func(f *publicationFixture) {
			f.data.Loot[0].ReceivedTs.Time = f.data.Loot[0].ReceivedTs.Time.Add(time.Microsecond)
		},
		"overview damage":          func(f *publicationFixture) { f.data.Overview[0].TopIncomingDamageAbilities[0].Damage++ },
		"overview duration":        func(f *publicationFixture) { f.data.Overview[0].TotalBossDurationMs++ },
		"speedrun duration":        func(f *publicationFixture) { f.data.Speedruns[0].DurationMs++ },
		"speedrun ranked duration": func(f *publicationFixture) { f.data.Speedruns[0].RankedDurationMs.Int64++ },
		"speedrun proof": func(f *publicationFixture) {
			f.data.Speedruns[0].Proof = []byte(`{"proof":[],"evidence":9007199254740994}`)
		},
		"speedrun nullable duration": func(f *publicationFixture) { f.data.Speedruns[0].BossToBossDurationMs.Valid = false },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newPublicationFixture()
			change(&f)
			require.NotEqual(t, baseline, jsonBytes(t, f.canonical(t)))
		})
	}
}
func TestPublicationReferencesAndMissingOutput(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(*publicationFixture){
		"missing guild":         func(f *publicationFixture) { f.data.Guilds = nil },
		"missing player":        func(f *publicationFixture) { f.data.Players = nil },
		"foreign provenance":    func(f *publicationFixture) { f.data.Players[0].UpdatedFromInstance.UUID = uuid.New() },
		"no provenance":         func(f *publicationFixture) { f.data.Players[0].UpdatedFromInstance.Valid = false },
		"foreign gear realm":    func(f *publicationFixture) { f.data.Gear[0].RealmID = uuid.New() },
		"foreign loot":          func(f *publicationFixture) { f.data.Loot[0].InstanceID = uuid.New() },
		"missing overview":      func(f *publicationFixture) { f.data.Overview = nil },
		"duplicate overview":    func(f *publicationFixture) { f.data.Overview = append(f.data.Overview, f.data.Overview[0]) },
		"malformed proof":       func(f *publicationFixture) { f.data.Speedruns[0].Proof = []byte(`{`) },
		"multiple proof values": func(f *publicationFixture) { f.data.Speedruns[0].Proof = []byte(`{} {}`) },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newPublicationFixture()
			change(&f)
			_, _, err := canonicalPublication(f.data, f.instances, f.keys)
			require.Error(t, err)
		})
	}
}
func TestLootMultiset(t *testing.T) {
	t.Parallel()
	a, b := newPublicationFixture(), newPublicationFixture()
	for _, f := range []*publicationFixture{&a, &b} {
		same := f.data.Loot[0]
		same.ID = uuid.New()
		different := same
		different.ID = uuid.New()
		different.Quantity = 2
		f.data.Loot = append(f.data.Loot, same, different)
	}
	b.data.Loot[0], b.data.Loot[2] = b.data.Loot[2], b.data.Loot[0]
	require.Equal(t, jsonBytes(t, a.canonical(t)), jsonBytes(t, b.canonical(t)))
	require.Len(t, a.canonical(t).Loot, 3)
	b.data.Loot = b.data.Loot[:2]
	require.NotEqual(t, jsonBytes(t, a.canonical(t)), jsonBytes(t, b.canonical(t)))
}
func TestPublicationScopedQueries(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	require.NoError(t, requireEmptyArmory(ctx, db))
	group := seedGroup(t, ctx, db)
	require.NoError(t, db.InsertParsedLogGroup(ctx, group))
	f := newPublicationFixture()
	instance := f.instances[0].ID
	realm := f.instances[0].RealmID
	now := f.data.Players[0].UpdatedAt
	guild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm, Name: "guild", CreatedAt: now})
	require.NoError(t, err)
	f.data.Guilds[0].ID = guild.ID
	f.instances[0].GuildID.UUID = guild.ID
	f.data.Players[0].GuildID.UUID = guild.ID
	f.data.Speedruns[0].GuildID.UUID = guild.ID
	require.ErrorContains(t, requireEmptyArmory(ctx, db), "empty guilds")
	_, err = db.InsertInstance(ctx, database.InsertInstanceParams{ID: instance, LogGroupID: group, RealmID: realm, GuildID: f.instances[0].GuildID, Name: "raid", StartTime: now, EndTime: now, Capabilities: []string{}, Versions: database.VersionsMap{}})
	require.NoError(t, err)
	require.NoError(t, db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{ID: 123, RealmID: realm, Name: "player", GuildID: f.instances[0].GuildID, Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman, Gender: database.WowPlayableGenderMale, Gear: f.data.Players[0].Gear, Level: 60, UpdatedAt: now, UpdatedFromInstance: uuid.NullUUID{UUID: instance, Valid: true}}}).Close())
	require.NoError(t, db.UpsertPlayerGearHistory(ctx, []database.UpsertPlayerGearHistoryParams{{PlayerID: 123, RealmID: realm, InstanceID: instance, Gear: f.data.Gear[0].Gear, AvgIlvl: f.data.Gear[0].AvgIlvl, EquippedAt: now}}).Close())
	require.NoError(t, db.InsertInstanceLoot(ctx, []database.InsertInstanceLootParams{{InstanceID: instance, RealmID: realm, SourceGuid: 9007199254740993, SourceTs: now, ReceivedGuid: 123, ReceivedTs: now, ItemID: 12345, ItemName: "item", Quantity: 1}}).Close())
	require.NoError(t, db.UpsertInstanceOverviewMetrics(ctx, database.UpsertInstanceOverviewMetricsParams{InstanceID: instance, TopIncomingDamageAbilities: f.data.Overview[0].TopIncomingDamageAbilities, EncounterSpanDurationMs: 12345, TotalCombatDurationMs: 6789, TotalBossDurationMs: 1234, MetricsVersion: 3}))
	require.NoError(t, db.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{InstanceID: instance, InstanceName: "raid", RealmID: realm, GuildID: f.instances[0].GuildID, Qualified: true, StartTime: now, CompletionTime: now, DurationMs: 12345, RankedDurationMs: pgtype.Int8{Int64: 1234, Valid: true}, RankedStartTime: now, RankedCompletionTime: now, Proof: f.data.Speedruns[0].Proof}))
	loaded, err := loadPublication(ctx, db, group)
	require.NoError(t, err)
	require.Len(t, loaded.Guilds, 1)
	require.Len(t, loaded.Players, 1)
	require.Len(t, loaded.Gear, 1)
	require.Len(t, loaded.Loot, 1)
	require.Len(t, loaded.Overview, 1)
	require.Len(t, loaded.Speedruns, 1)
	out, _, err := canonicalPublication(loaded, f.instances, f.keys)
	require.NoError(t, err)
	require.Contains(t, string(jsonBytes(t, out)), `9007199254740993`)
	unrelated := seedGroup(t, ctx, db)
	_, err = loadPublication(ctx, db, unrelated)
	require.ErrorContains(t, err, "outside selected parse")
	emptyLoot, err := db.BaselineLoot(ctx, unrelated)
	require.NoError(t, err)
	require.Empty(t, emptyLoot)
	emptyOverview, err := db.BaselineOverview(ctx, unrelated)
	require.NoError(t, err)
	require.Empty(t, emptyOverview)
	emptySpeedruns, err := db.BaselineSpeedruns(ctx, unrelated)
	require.NoError(t, err)
	require.Empty(t, emptySpeedruns)
	// An unrelated player in the SAME realm must not be silently dumped as output.
	require.NoError(t, db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{ID: 999, RealmID: realm, Name: "unrelated", Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman, Gender: database.WowPlayableGenderMale, UpdatedAt: now}}).Close())
	_, err = loadPublication(ctx, db, group)
	require.ErrorContains(t, err, "outside selected parse")
}
