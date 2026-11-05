package chronicle

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestParsedSpeedrunRowsMatchLegacyDirectWriter(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "speedrun-parity-" + owner.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "speedrun-parity-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Speedrun Realm"})
	require.NoError(t, err)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2,
		CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	ids := [2]uuid.UUID{uuid.New(), uuid.New()}
	for _, id := range ids {
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{ID: id, RealmID: realm, LogGroupID: group, Name: "Speedrun Test",
			StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
		require.NoError(t, err)
	}
	proof := []rankings.SpeedrunProof{{Requirement: rankings.SpeedrunRequirement{Name: "Boss", EntryIDs: []uint32{17, 18}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		Kills: []rankings.KillRecord{{EntryID: 17, Timestamp: at.Add(time.Minute)}}, Satisfied: true}}
	sr := &rankings.SpeedrunResult{Qualified: true, StartTime: at, CompletionTime: at.Add(time.Minute), Duration: time.Minute,
		RankedStartTime: at.Add(time.Second), RankedCompletionTime: at.Add(time.Minute), RankedDuration: 59 * time.Second,
		BossToBossStartTime: at.Add(2 * time.Second), BossToBossCompletionTime: at.Add(time.Minute), BossToBossDuration: 58 * time.Second,
		Proof: proof, LevelRange: &rankings.LevelRangeResult{Satisfied: true, Requirement: rankings.LevelRangeRequirement{MinLevel: 50, MaxLevel: 60}}}
	fin := &instances.FinalizedInstance{Versions: map[string]string{"addon": "2.1"}, Rankings: &rankings.RankingsResult{Speedrun: sr},
		Encounters: []encounter.Encounter{{Boss: true, KillType: encounter.KillTypeClean}}}
	projected, err := parseresult.Build(parseresult.Input{Format: database.LogFormat112aCcAddon, Name: "Speedrun Test", Finalized: fin, Events: encounterevents.NewEvents()})
	require.NoError(t, err)
	encoded, err := json.Marshal(projected)
	require.NoError(t, err)
	var result parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &result))
	proofJSON, err := json.Marshal(rankings.SpeedrunProofPayload{Proof: proof, LevelRange: sr.LevelRange})
	require.NoError(t, err)
	guildID := uuid.NullUUID{}
	require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID: ids[0], InstanceName: "Speedrun Test", RealmID: realm, GuildID: guildID, Qualified: true,
		StartTime: database.Timestamptz(sr.StartTime), CompletionTime: database.Timestamptz(sr.CompletionTime), DurationMs: sr.Duration.Milliseconds(),
		RankedStartTime: database.Timestamptz(sr.RankedStartTime), RankedCompletionTime: database.Timestamptz(sr.RankedCompletionTime), RankedDurationMs: pgtype.Int8{Int64: sr.RankedDuration.Milliseconds(), Valid: true},
		BossToBossStartTime: database.Timestamptz(sr.BossToBossStartTime), BossToBossCompletionTime: database.Timestamptz(sr.BossToBossCompletionTime), BossToBossDurationMs: pgtype.Int8{Int64: sr.BossToBossDuration.Milliseconds(), Valid: true},
		Proof: proofJSON, AddonVersion: "2.1",
	}))
	write := ParsedSpeedrunWrite{InstanceID: ids[1], RealmID: realm, GuildID: guildID, Rankable: true}
	require.NoError(t, InsertParsedSpeedrun(ctx, store, result, write))
	legacy, err := store.GetInstanceSpeedrun(ctx, ids[0])
	require.NoError(t, err)
	fresh, err := store.GetInstanceSpeedrun(ctx, ids[1])
	require.NoError(t, err)
	legacy.InstanceID, fresh.InstanceID = uuid.Nil, uuid.Nil
	legacy.CreatedAt, fresh.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	if diff := cmp.Diff(legacy, fresh); diff != "" {
		t.Fatalf("speedrun rows differ (-legacy +new):\n%s", diff)
	}

	// Ineligibility is an insert gate; missing addon/server-side affects only qualification.
	for _, tc := range []struct {
		name      string
		mutate    func(*parseresult.Result, *ParsedSpeedrunWrite)
		wantRow   bool
		qualified bool
	}{
		{name: "unrankable", mutate: func(_ *parseresult.Result, w *ParsedSpeedrunWrite) { w.Rankable = false }},
		{name: "trash-only", mutate: func(r *parseresult.Result, _ *ParsedSpeedrunWrite) { r.Speedrun.HasBossKill = false }},
		{name: "no speedrun", mutate: func(r *parseresult.Result, _ *ParsedSpeedrunWrite) { r.Speedrun = nil }},
		{name: "no source", mutate: func(r *parseresult.Result, _ *ParsedSpeedrunWrite) { r.Speedrun.AddonVersion = "" }, wantRow: true, qualified: false},
		{name: "no timing windows", mutate: func(r *parseresult.Result, _ *ParsedSpeedrunWrite) {
			r.Speedrun.Ranked = nil
			r.Speedrun.BossToBoss = nil
		}, wantRow: true, qualified: true},
		{name: "server-side", mutate: func(r *parseresult.Result, _ *ParsedSpeedrunWrite) {
			r.Speedrun.AddonVersion = ""
			r.Speedrun.ServerSide = true
		}, wantRow: true, qualified: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			id := uuid.New()
			_, err := store.InsertInstance(ctx, database.InsertInstanceParams{ID: id, RealmID: realm, LogGroupID: group, Name: "Speedrun Test",
				StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
			require.NoError(t, err)
			copyResult := result
			speedrun := *result.Speedrun
			copyResult.Speedrun = &speedrun
			w := write
			w.InstanceID = id
			tc.mutate(&copyResult, &w)
			require.NoError(t, InsertParsedSpeedrun(ctx, store, copyResult, w))
			row, err := store.GetInstanceSpeedrun(ctx, id)
			if !tc.wantRow {
				require.ErrorIs(t, err, pgx.ErrNoRows)
				return
			}
			require.NoError(t, err)
			if tc.name == "no timing windows" {
				require.False(t, row.RankedStartTime.Valid)
				require.False(t, row.RankedCompletionTime.Valid)
				require.False(t, row.RankedDurationMs.Valid)
				require.False(t, row.BossToBossStartTime.Valid)
				require.False(t, row.BossToBossCompletionTime.Valid)
				require.False(t, row.BossToBossDurationMs.Valid)
			}
			require.Equal(t, tc.qualified, row.Qualified)
		})
	}
}
