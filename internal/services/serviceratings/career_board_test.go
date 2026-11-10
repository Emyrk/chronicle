package serviceratings

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
)

func TestCombineCareerBoard(t *testing.T) {
	t.Parallel()
	key := leaderboardconfig.CareerKey{Instance: "raid"}
	weight := 1.0
	pool := leaderboardconfig.CareerPool{Variants: []leaderboardconfig.CareerVariant{{
		CareerKey: key, Active: true, IncludeAverage: true, IncludeRenown: true, Weight: &weight,
		RenownBosses: []leaderboardconfig.CareerBoss{{Name: "Boss", Points: 2, HasPoints: true}},
	}}}
	computed := pgtype.Timestamptz{Time: time.Now(), Valid: true}
	realm := uuid.New()
	// dps/hps are each spec's Mastery per metric (0 = no evidence); the higher one is chosen.
	row := func(kind, id, spec string, dps, hps float64, kills int64) database.LeaderboardCareerSubject {
		inputs := CareerInputs{Kills: []CareerBossKills{{CareerKey: key, Boss: "Boss", Count: kills}}}
		chosen := ""
		for _, m := range []struct {
			metric string
			value  float64
		}{{"dps", dps}, {"hps", hps}} {
			if m.value > 0 {
				inputs.Raids = append(inputs.Raids, CareerRaidInput{CareerKey: key, Metric: m.metric, Mastery: m.value, Peak: m.value + 10, EligibleKills: kills})
				if chosen == "" || (m.metric == "hps" && hps > dps) {
					chosen = m.metric
				}
			}
		}
		if kind == "guild" {
			chosen = "kill_time"
			inputs.Raids = []CareerRaidInput{{CareerKey: key, Metric: "kill_time", Mastery: dps, Peak: dps + 10, EligibleKills: kills}}
		}
		raw, err := json.Marshal(inputs)
		require.NoError(t, err)
		return database.LeaderboardCareerSubject{SubjectKind: kind, RealmID: realm, SubjectID: id, PlayerClass: "PRIEST", PlayerSpec: spec, ChosenMetric: chosen, Inputs: raw, ComputedAt: computed}
	}
	players := []database.LeaderboardCareerSubject{
		// a: Shadow has the best Mastery; Unknown's higher Mastery never qualifies.
		row("player", "a", "Discipline", 30, 45, 3),
		row("player", "a", "Shadow", 50, 0, 2),
		row("player", "a", "Unknown", 90, 0, 1),
		// b: Renown only, no Mastery anywhere.
		row("player", "b", "Holy", 0, 0, 4),
	}

	got, err := combineCareerBoard(pool, players, CareerBoardFilter{})
	require.NoError(t, err)
	require.Len(t, got, 2)
	require.Equal(t, "Shadow", got[0].PlayerSpec)
	require.Equal(t, 50.0, *got[0].Mastery)
	require.Equal(t, 60.0, *got[0].Peak)
	require.Equal(t, "dps", *got[0].ChosenMetric)
	require.Len(t, got[0].Contributions, 1)
	require.Equal(t, 2.0*(3+2+1), got[0].Renown, "Renown adds every spec, Unknown included")
	require.Nil(t, got[1].Mastery)
	require.Equal(t, 8.0, got[1].Renown)

	// HPS only: Discipline's healing (45) is the only HPS evidence.
	got, err = combineCareerBoard(pool, players, CareerBoardFilter{Metric: "hps"})
	require.NoError(t, err)
	require.Equal(t, "Discipline", got[0].PlayerSpec)
	require.Equal(t, 45.0, *got[0].Mastery)
	require.Equal(t, "hps", *got[0].ChosenMetric)

	// A spec filter takes Mastery from that spec and keeps only characters who played it.
	got, err = combineCareerBoard(pool, players, CareerBoardFilter{Spec: "Discipline"})
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, 45.0, *got[0].Mastery, "Discipline's chosen metric is HPS")
	require.Equal(t, 12.0, got[0].Renown, "Renown still adds every spec")

	// Guilds have one specless row each.
	got, err = combineCareerBoard(pool, []database.LeaderboardCareerSubject{row("guild", uuid.NewString(), "", 70, 0, 5)}, CareerBoardFilter{Guilds: true})
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, 70.0, *got[0].Mastery)
	require.Equal(t, "kill_time", *got[0].ChosenMetric)
}
