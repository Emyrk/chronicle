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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type rankingFixture struct {
	data                      rankingData
	group                     uuid.UUID
	instances                 []database.LogInstancesGuild
	instanceIDs, encounterIDs map[uuid.UUID]string
}

func newRankingFixture() rankingFixture {
	group, instance, encounter, talent, guild := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	now := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	return rankingFixture{
		group: group, instances: []database.LogInstancesGuild{{ID: instance}}, instanceIDs: map[uuid.UUID]string{instance: "instance/0"}, encounterIDs: map[uuid.UUID]string{encounter: "instance/0/encounter/0"},
		data: rankingData{
			Rankings: []database.EncounterDpsRanking{{ID: uuid.New(), InstanceID: instance, EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, TalentBuildID: uuid.NullUUID{UUID: talent, Valid: true}, GuildID: uuid.NullUUID{UUID: guild, Valid: true}, EncounterName: "boss", PlayerGuid: "0x123", DamageDone: 9007199254740993, UnrankedDamageDone: 17, DurationSecs: 12.3456789, Dps: 123.456789, PlayerDeaths: pgtype.Int4{Int32: 0, Valid: true}, AlivePercentage: pgtype.Float8{Float64: 99.123456789, Valid: true}, KilledAt: now}},
			Talents:  []database.TalentBuild{{ID: talent, DatasetID: dbstatic.RealmUnknown(), PlayerClass: "Warrior", TalentLayout: "123", TalentSummary: []int16{1, 2, 3}, Spec: "Arms"}},
			Guilds:   []database.Guild{{ID: guild, RealmID: dbstatic.RealmNordanaar(), Name: "guild"}},
			Parses:   []database.ParseScoreMembership{{ID: uuid.New(), RunID: instance, InstanceID: instance, LogGroupID: group, EncounterName: "boss", PlayerGuid: "0x123", PolicyVersion: 1, QueryVersion: 2, Dps: 123.456789, Hps: 12.34, KilledAt: now}},
			Clears:   []database.TimeParseClearTimeMembership{{ID: uuid.New(), RunID: instance, InstanceID: instance, LogGroupID: group, PolicyVersion: 1, QueryVersion: 2, DurationMs: 12345, StartTime: now}},
			Bosses:   []database.TimeParseBossKillMembership{{ID: uuid.New(), RunID: instance, InstanceID: instance, LogGroupID: group, EncounterName: "boss", PolicyVersion: 1, QueryVersion: 2, DurationMs: 1234, KilledAt: now}},
		},
	}
}
func (f rankingFixture) canonical(t *testing.T) rankingOutput {
	t.Helper()
	out, err := canonicalRankings(f.data, f.group, f.instances, f.instanceIDs, f.encounterIDs)
	require.NoError(t, err)
	return out
}
func TestRankingCanonicalGeneratedIDs(t *testing.T) {
	t.Parallel()
	first, second := newRankingFixture(), newRankingFixture()
	// Operational bookkeeping is deliberately excluded; semantic evidence is not.
	second.data.Rankings[0].CreatedAt = database.Timestamptz(time.Now())
	second.data.Rankings[0].LogHashedSlug = "different-slug"
	second.data.Talents[0].CreatedAt = database.Timestamptz(time.Now())
	a, b := first.canonical(t), second.canonical(t)
	require.Equal(t, jsonBytes(t, a), jsonBytes(t, b))
	require.Contains(t, string(jsonBytes(t, a)), `"damage_done":9007199254740993`)
	for name, change := range map[string]func(*rankingFixture){
		"ranking evidence":          func(f *rankingFixture) { f.data.Rankings[0].UnrankedDamageDone++ },
		"ranking duration":          func(f *rankingFixture) { f.data.Rankings[0].DurationSecs += 0.0000001 },
		"ranking DPS":               func(f *rankingFixture) { f.data.Rankings[0].Dps += 0.0000001 },
		"ranking nullable evidence": func(f *rankingFixture) { f.data.Rankings[0].PlayerDeaths.Valid = false },
		"ranking kill time": func(f *rankingFixture) {
			f.data.Rankings[0].KilledAt.Time = f.data.Rankings[0].KilledAt.Time.Add(time.Microsecond)
		},
		"talent summary": func(f *rankingFixture) { f.data.Talents[0].TalentSummary[0]++ },
		"parse DPS":      func(f *rankingFixture) { f.data.Parses[0].Dps += 0.0000001 },
		"parse HPS":      func(f *rankingFixture) { f.data.Parses[0].Hps += 0.0000001 },
		"clear duration": func(f *rankingFixture) { f.data.Clears[0].DurationMs++ },
		"boss duration":  func(f *rankingFixture) { f.data.Bosses[0].DurationMs++ },
		"boss timestamp": func(f *rankingFixture) {
			f.data.Bosses[0].KilledAt.Time = f.data.Bosses[0].KilledAt.Time.Add(time.Microsecond)
		},
		"membership version": func(f *rankingFixture) { f.data.Parses[0].QueryVersion++ },
		"missing membership": func(f *rankingFixture) { f.data.Parses = nil },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			changed := newRankingFixture()
			change(&changed)
			require.NotEqual(t, jsonBytes(t, a), jsonBytes(t, changed.canonical(t)))
		})
	}
}
func TestRankingReferencesFailClosed(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(*rankingFixture){
		"talent missing": func(f *rankingFixture) { f.data.Talents = nil },
		"talent ambiguous": func(f *rankingFixture) {
			clone := f.data.Talents[0]
			clone.ID = uuid.New()
			f.data.Talents = append(f.data.Talents, clone)
		},
		"guild missing":                           func(f *rankingFixture) { f.data.Guilds = nil },
		"encounter missing":                       func(f *rankingFixture) { f.encounterIDs = nil },
		"instance missing":                        func(f *rankingFixture) { f.data.Rankings[0].InstanceID = uuid.New() },
		"membership representative outside scope": func(f *rankingFixture) { f.data.Parses[0].InstanceID = uuid.New() },
		"membership group mismatch":               func(f *rankingFixture) { f.data.Clears[0].LogGroupID = uuid.New() },
		"membership run missing":                  func(f *rankingFixture) { f.data.Bosses[0].RunID = uuid.New() },
		"external duplicate anchor": func(f *rankingFixture) {
			f.instances[0].DuplicateGroupID = uuid.NullUUID{UUID: uuid.New(), Valid: true}
		},
		"ambiguous ranking": func(f *rankingFixture) {
			clone := f.data.Rankings[0]
			clone.ID = uuid.New()
			f.data.Rankings = append(f.data.Rankings, clone)
		},
		"ambiguous membership": func(f *rankingFixture) {
			clone := f.data.Parses[0]
			clone.ID = uuid.New()
			f.data.Parses = append(f.data.Parses, clone)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f := newRankingFixture()
			change(&f)
			_, err := canonicalRankings(f.data, f.group, f.instances, f.instanceIDs, f.encounterIDs)
			require.Error(t, err)
		})
	}
}

func TestRankingQueriesAndMembershipRefresh(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	group := seedGroup(t, ctx, db)
	require.NoError(t, db.InsertParsedLogGroup(ctx, group))
	start := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	end := database.Timestamptz(start.Time.Add(12 * time.Second))
	instance, encounter := uuid.New(), uuid.New()
	_, err := db.InsertInstance(ctx, database.InsertInstanceParams{ID: instance, RealmID: dbstatic.RealmNordanaar(), LogGroupID: group, Name: "raid", StartTime: start, EndTime: end, Capabilities: []string{}, Versions: database.VersionsMap{}})
	require.NoError(t, err)
	_, err = db.InsertEncounter(ctx, database.InsertEncounterParams{ID: encounter, InstanceID: instance, Name: "boss", StartTime: start, EndTime: end, KillType: database.KillTypeClean, Boss: true, Remaining: guid.GUIDs{}})
	require.NoError(t, err)
	dataset, err := db.InsertDataset(ctx, database.InsertDatasetParams{Name: "baseline", Slug: uuid.NewString(), WowVersion: "1.12.1", BuildVersion: 5875, DefaultFlavor: []string{}})
	require.NoError(t, err)
	talent, err := db.UpsertTalentBuild(ctx, database.UpsertTalentBuildParams{DatasetID: dataset.ID, PlayerClass: "Warrior", TalentLayout: "123", TalentSummary: []int16{1, 2, 3}, Spec: "Arms"})
	require.NoError(t, err)
	guild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: dbstatic.RealmNordanaar(), Name: "baseline-guild", CreatedAt: start})
	require.NoError(t, err)
	require.NoError(t, db.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{InstanceID: instance, EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, EncounterName: "boss", InstanceName: "raid", PlayerGuid: "0x123", PlayerName: "player", PlayerClass: "Warrior", PlayerSpec: "Arms", TalentBuildID: uuid.NullUUID{UUID: talent, Valid: true}, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true}, RealmID: dbstatic.RealmNordanaar(), DamageDone: 12000, DurationSecs: 12, Dps: 1000, KilledAt: end}))
	require.NoError(t, db.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{InstanceID: instance, InstanceName: "raid", RealmID: dbstatic.RealmNordanaar(), Qualified: true, StartTime: start, CompletionTime: end, DurationMs: 12000, RankedDurationMs: pgtype.Int8{Int64: 12000, Valid: true}, RankedStartTime: start, RankedCompletionTime: end, Proof: []byte(`{}`)}))
	_, err = db.RefreshParseScoreMembershipsForLogGroup(ctx, database.RefreshParseScoreMembershipsForLogGroupParams{LogGroupID: group, PolicyVersion: 1, QueryVersion: 1})
	require.NoError(t, err)
	_, err = db.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{LogGroupID: group, PolicyVersion: 1, QueryVersion: 1})
	require.NoError(t, err)
	_, err = db.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{LogGroupID: group, PolicyVersion: 1, QueryVersion: 1})
	require.NoError(t, err)
	data, err := loadRankings(ctx, db, group)
	require.NoError(t, err)
	require.Len(t, data.Rankings, 1)
	require.Len(t, data.Talents, 1)
	require.Len(t, data.Guilds, 1)
	require.Len(t, data.Parses, 1)
	require.Len(t, data.Clears, 1)
	require.Len(t, data.Bosses, 1)
	canonical, err := canonicalRankings(data, group, []database.LogInstancesGuild{{ID: instance}}, map[uuid.UUID]string{instance: "instance/0"}, map[uuid.UUID]string{encounter: "instance/0/encounter/0"})
	require.NoError(t, err)
	require.Len(t, canonical.Rankings, 1)
	unrelated := seedGroup(t, ctx, db)
	require.NoError(t, db.InsertParsedLogGroup(ctx, unrelated))
	empty, err := loadRankings(ctx, db, unrelated)
	require.NoError(t, err)
	require.Empty(t, empty.Rankings)
	require.Empty(t, empty.Talents)
	require.Empty(t, empty.Parses)
	require.Empty(t, empty.Clears)
	require.Empty(t, empty.Bosses)
	// The scoped query must include affected-run memberships even if another log
	// owns the representative. Canonicalization then rejects that unsupported scope.
	outside := uuid.New()
	_, err = db.InsertInstance(ctx, database.InsertInstanceParams{ID: outside, RealmID: dbstatic.RealmNordanaar(), LogGroupID: unrelated, Name: "raid", StartTime: start, EndTime: end, Capabilities: []string{}, Versions: database.VersionsMap{}})
	require.NoError(t, err)
	require.NoError(t, db.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{DuplicateGroupID: uuid.NullUUID{UUID: instance, Valid: true}, Ids: []uuid.UUID{outside, instance}}))
	affected, err := loadRankings(ctx, db, unrelated)
	require.NoError(t, err)
	require.Len(t, affected.Parses, 1)
	require.Len(t, affected.Clears, 1)
	require.Len(t, affected.Bosses, 1)
	_, err = canonicalRankings(affected, unrelated, []database.LogInstancesGuild{{ID: outside, DuplicateGroupID: uuid.NullUUID{UUID: instance, Valid: true}}}, map[uuid.UUID]string{outside: "instance/0"}, nil)
	require.Error(t, err)
}

func TestRankingRowOrderAndTrashSpecs(t *testing.T) {
	t.Parallel()
	left, right := newRankingFixture(), newRankingFixture()
	for _, fixture := range []*rankingFixture{&left, &right} {
		trash := fixture.data.Rankings[0]
		trash.ID = uuid.New()
		trash.EncounterID = uuid.NullUUID{}
		trash.EncounterName = "Trash"
		trash.PlayerSpec = "Arms"
		otherSpec := trash
		otherSpec.ID = uuid.New()
		otherSpec.PlayerSpec = "Fury"
		fixture.data.Rankings = append(fixture.data.Rankings, trash, otherSpec)
		member := fixture.data.Parses[0]
		member.ID = uuid.New()
		member.PlayerGuid = "0x456"
		fixture.data.Parses = append(fixture.data.Parses, member)
	}
	right.data.Rankings[0], right.data.Rankings[2] = right.data.Rankings[2], right.data.Rankings[0]
	right.data.Parses[0], right.data.Parses[1] = right.data.Parses[1], right.data.Parses[0]
	require.Equal(t, jsonBytes(t, left.canonical(t)), jsonBytes(t, right.canonical(t)))
}
