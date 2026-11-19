package chronicle

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestParsedTrashRankingDirectWriterParity(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "trash-rank-" + owner.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "trash-rank-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Trash Realm"})
	require.NoError(t, err)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	ids := [2]uuid.UUID{uuid.New(), uuid.New()}
	var dbinstances [2]database.LogInstance
	for i, id := range ids {
		dbinstances[i], err = store.InsertInstance(ctx, database.InsertInstanceParams{ID: id, RealmID: realm, LogGroupID: group, Name: "Trash Raid", StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
		require.NoError(t, err)
	}
	player, pet := guid.GUID(42), guid.GUID(7)
	guilds := armory.New(unitdb.New())
	guilds.Players[player] = combatant.Combatant{Guid: player, Name: "Alice"}
	guilds.Guilds["Team"] = map[guid.GUID]struct{}{player: {}}
	enc1, enc2, short, wipe := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	fin := &instances.FinalizedInstance{Guilds: guilds, RankingRules: &rankings.Rankings{}, Rankings: &rankings.RankingsResult{
		DPS: map[uuid.UUID]*rankings.DPSResult{
			enc1:  {Units: map[guid.GUID]*rankings.UnitCombatStats{player: {IsPlayer: true, DamageDone: 80, HealingDone: 5, HealingAbsorbed: 2, DamageTaken: 10}, pet: {OwnerGUID: &player, DamageDone: 20, HealingDone: 4, HealingAbsorbed: 3}}},
			enc2:  {Units: map[guid.GUID]*rankings.UnitCombatStats{player: {IsPlayer: true, DamageDone: 30, HealingDone: 10}}},
			short: {Units: map[guid.GUID]*rankings.UnitCombatStats{player: {IsPlayer: true, DamageDone: 999}}},
			wipe:  {Units: map[guid.GUID]*rankings.UnitCombatStats{player: {IsPlayer: true, DamageDone: 999}}},
		}, Survivability: map[uuid.UUID]*rankings.SurvivabilityResult{enc1: {Players: map[guid.GUID]rankings.PlayerSurvivability{player: {Deaths: 1, AliveDurationSecs: 5}}}},
	}, Encounters: []encounter.Encounter{
		{KillType: encounter.KillTypeClean, Combat: encounter.Fight{EncounterID: enc1, Start: at, End: at.Add(10 * time.Second)}},
		{KillType: encounter.KillTypeClean, Combat: encounter.Fight{EncounterID: enc2, Start: at.Add(20 * time.Second), End: at.Add(26 * time.Second)}},
		{KillType: encounter.KillTypeClean, Combat: encounter.Fight{EncounterID: short, Start: at.Add(30 * time.Second), End: at.Add(31 * time.Second)}},
		{KillType: encounter.KillTypeWipe, Combat: encounter.Fight{EncounterID: wipe, Start: at.Add(40 * time.Second), End: at.Add(50 * time.Second)}},
	}}
	projection, err := parseresult.Build(parseresult.Input{Format: database.LogFormat112aCcAddon, Name: "Trash Raid", Finalized: fin, Events: encounterevents.NewEvents()})
	require.NoError(t, err)
	encoded, err := json.Marshal(projection)
	require.NoError(t, err)
	var result parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &result))
	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		InstanceID: ids[0], EncounterName: "Trash", InstanceName: "Trash Raid",
		PlayerGuid: player.String(), PlayerName: "Alice", PlayerClass: "UNKNOWN", PlayerSpec: "Unknown", PlayerRole: "dps", GuildName: "Team",
		DifficultyName: "Normal", MaxPlayers: 40, RealmID: realm, RealmName: "Trash Realm", DamageDone: 130,
		DurationSecs: 16, Dps: 130.0 / 16, HealingDone: 19, AbsorbedDone: 5, Hps: 24.0 / 16,
		AlivePercentage: pgtype.Float8{Float64: 11.0 / 16 * 100, Valid: true}, PlayerDeaths: pgtype.Int4{Int32: 1, Valid: true},
		KilledAt: database.Timestamptz(at.Add(26 * time.Second)),
	}))
	write := ParsedBossRankingWrite{Instance: dbinstances[1], RealmName: "Trash Realm", Rankable: true}
	require.NoError(t, InsertParsedTrashRankings(ctx, store, result, write))
	direct, err := store.InstanceRankingRecords(ctx, ids[0])
	require.NoError(t, err)
	projected, err := store.InstanceRankingRecords(ctx, ids[1])
	require.NoError(t, err)
	require.Len(t, direct, 1)
	require.Len(t, projected, 1)
	direct[0].ID, projected[0].ID = uuid.Nil, uuid.Nil
	direct[0].InstanceID, projected[0].InstanceID = uuid.Nil, uuid.Nil
	direct[0].CreatedAt, projected[0].CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	if diff := cmp.Diff(direct, projected); diff != "" {
		t.Fatalf("trash ranking rows differ (-direct +adapter):\n%s", diff)
	}
	for _, mutate := range []func(*parseresult.Result, *ParsedBossRankingWrite){
		func(_ *parseresult.Result, w *ParsedBossRankingWrite) { w.Rankable = false },
		func(r *parseresult.Result, _ *ParsedBossRankingWrite) { r.BossRankings.HasRules = false },
		func(r *parseresult.Result, _ *ParsedBossRankingWrite) { r.BossRankings.HasDPS = false },
		func(r *parseresult.Result, _ *ParsedBossRankingWrite) { r.BossRankings.LevelEligible = false },
	} {
		r := result
		w := write
		mutate(&r, &w)
		require.NoError(t, InsertParsedTrashRankings(ctx, nil, r, w))
	}
}
