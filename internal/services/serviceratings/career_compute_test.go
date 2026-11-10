package serviceratings

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestComputeCareerInputs(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	key := leaderboardconfig.CareerKey{Instance: "Fixture raid", Difficulty: "Normal", MaxPlayers: 40}
	pool := leaderboardconfig.CareerPool{Variants: []leaderboardconfig.CareerVariant{{CareerKey: key, Active: true, IncludeAverage: true, IncludeRenown: true, AverageBosses: []string{"Boss", "Missing"}, RenownBosses: []leaderboardconfig.CareerBoss{{Name: "Boss"}, {Name: "Optional", Points: 999, HasPoints: true}}}}}
	row := map[string]any{"tenant_id": f.tenant, "realm_id": f.realm, "guild_id": f.guild, "player_guid": "Player", "player_class": "MAGE", "player_spec": "Frost", "player_sub_spec": "", "instance_name": key.Instance, "difficulty_name": key.Difficulty, "max_players": key.MaxPlayers, "encounter_name": "Boss", "projection_version": 1, "algorithm_version": 1, "computed_at": "2026-01-01Z", "observed_at": "2026-01-01Z", "observation_count": 3, "raw_peak": 80, "raw_form": 60, "raw_floor": 40, "best_metric": 100, "fastest_duration_ms": 1000, "best_duration_ms": 800, "form_mean_inverse_ms": 0.00075, "floor_mean_inverse_ms": 0.0005, "run_id": uuid.New(), "source_instance_id": uuid.New(), "source_encounter_id": uuid.New()}
	insert := func(table string) {
		data, err := json.Marshal(row)
		require.NoError(t, err)
		f.exec("INSERT INTO leaderboard_"+table+" SELECT (jsonb_populate_record(NULL::leaderboard_"+table+", $1::jsonb)).*", string(data))
	}
	for _, metric := range []string{"dps", "hps"} {
		row["metric"] = metric
		if metric == "hps" {
			row["raw_peak"] = 200
			row["observation_count"] = 7
		}
		insert("player_boss_subjects")
		insert("player_boss_benchmarks")
	}
	insert("guild_boss_subjects")
	insert("guild_boss_benchmarks")
	// Clears exist but must never contribute.
	insert("guild_clear_subjects")
	insert("guild_clear_benchmarks")
	for _, boss := range []string{"Boss", "Optional"} {
		row["encounter_name"] = boss
		insert("career_renown_facts")
		insert("guild_renown_facts")
	}
	// A different cohort is not additional Renown for Frost.
	row["player_spec"] = "Fire"
	insert("career_renown_facts")
	identity := CareerIdentity{SubjectKind: "player", RealmID: f.realm, SubjectID: "Player", PlayerClass: "MAGE", PlayerSpec: "Frost"}
	compute := func(id CareerIdentity) CareerInputs {
		var inputs CareerInputs
		require.NoError(t, f.db.InTx(f.tenantctx(), func(tx database.Store) error {
			var err error
			inputs, err = ComputeCareerInputs(f.tenantctx(), tx, f.tenant, id, pool)
			return err
		}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead}))
		return inputs
	}
	got := compute(identity)
	require.Len(t, got.Raids, 2)
	require.Equal(t, "dps", got.Raids[0].Metric)
	require.InDelta(t, 31, got.Raids[0].Mastery, 1e-9)
	require.Equal(t, float64(40), got.Raids[0].Peak)
	require.Equal(t, int64(3), got.Raids[0].EligibleKills)
	require.Equal(t, float64(50), got.Raids[1].Peak) // clamped before zero fill
	require.Equal(t, int64(7), got.Raids[1].EligibleKills)
	require.Equal(t, []CareerBossKills{{CareerKey: key, Boss: "Boss", Count: 1}, {CareerKey: key, Boss: "Optional", Count: 1}}, got.Kills)
	guild := compute(CareerIdentity{SubjectKind: "guild", RealmID: f.realm, SubjectID: f.guild.String()})
	require.Len(t, guild.Raids, 1)
	require.Equal(t, "kill_time", guild.Raids[0].Metric)
	require.InDelta(t, 31, guild.Raids[0].Mastery, 1e-9)
	require.Equal(t, got.Kills, guild.Kills)
	// Renown-only evidence survives missing average evidence and weights.
	pool.Variants[0].AverageBosses = []string{"Missing"}
	renownOnly := compute(identity)
	require.Empty(t, renownOnly.Raids)
	require.Equal(t, got.Kills, renownOnly.Kills)
	pool.Variants[0].AverageBosses = []string{"Boss", "Missing"}
	// Tenant filtering remains explicit even under an administrative context.
	otherTenant, err := ComputeCareerInputs(servicetenant.AdminBypass(f.ctx), f.db, uuid.New(), identity, pool)
	require.NoError(t, err)
	require.Empty(t, otherTenant.Kills)
	require.Empty(t, otherTenant.Raids)
	for _, raid := range otherTenant.Raids {
		require.Zero(t, raid.EligibleKills)
	}
	original := pool.Variants[0]
	for _, key := range []leaderboardconfig.CareerKey{
		{Instance: "Other", Difficulty: "Normal", MaxPlayers: 40},
		{Instance: "Fixture raid", Difficulty: "Heroic", MaxPlayers: 40},
		{Instance: "Fixture raid", Difficulty: "Normal", MaxPlayers: 25},
	} {
		pool.Variants[0].CareerKey = key
		empty := compute(identity)
		require.Empty(t, empty.Kills)
		require.Empty(t, empty.Raids)
		for _, raid := range empty.Raids {
			require.Zero(t, raid.EligibleKills)
		}
	}
	pool.Variants[0] = original
	for _, change := range []func(*CareerIdentity){func(i *CareerIdentity) { i.SubjectID = "Other" }, func(i *CareerIdentity) { i.RealmID = uuid.New() }, func(i *CareerIdentity) { i.PlayerClass = "PRIEST" }, func(i *CareerIdentity) { i.PlayerSpec = "Arcane" }, func(i *CareerIdentity) { i.PlayerSubSpec = "Other" }} {
		other := identity
		change(&other)
		empty := compute(other)
		require.Empty(t, empty.Kills)
		require.Empty(t, empty.Raids)
		for _, raid := range empty.Raids {
			require.Zero(t, raid.Mastery)
			require.Zero(t, raid.Peak)
			require.Zero(t, raid.EligibleKills)
		}
	}
}

func TestComputeCareerInputsRejectIdentity(t *testing.T) {
	t.Parallel()
	for _, id := range []CareerIdentity{
		{SubjectKind: "other", RealmID: uuid.New(), SubjectID: "Player"},
		{SubjectKind: "player", RealmID: uuid.New(), SubjectID: "Player", PlayerClass: "MAGE", PlayerSpec: "Class"},
		{SubjectKind: "guild", RealmID: uuid.New(), SubjectID: "not-uuid"},
	} {
		_, err := ComputeCareerInputs(context.Background(), nil, uuid.New(), id, leaderboardconfig.CareerPool{})
		require.Error(t, err)
	}
}
