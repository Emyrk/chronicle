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
	row := func(guid, spec string, mastery float64, kills int64) database.LeaderboardCareerSubject {
		inputs := CareerInputs{Kills: []CareerBossKills{{CareerKey: key, Boss: "Boss", Count: kills}}}
		metric := ""
		if mastery > 0 {
			metric = "dps"
			inputs.Raids = []CareerRaidInput{{CareerKey: key, Metric: "dps", Mastery: mastery, Peak: mastery + 10, EligibleKills: kills}}
		}
		raw, err := json.Marshal(inputs)
		require.NoError(t, err)
		return database.LeaderboardCareerSubject{RealmID: realm, SubjectID: guid, PlayerClass: "PRIEST", PlayerSpec: spec, ChosenMetric: metric, Inputs: raw, ComputedAt: computed}
	}

	got, err := combineCareerBoard(pool, []database.LeaderboardCareerSubject{
		// a: Shadow has the best Mastery; Unknown's higher Mastery never qualifies.
		row("a", "Discipline", 30, 3),
		row("a", "Shadow", 50, 2),
		row("a", "Unknown", 90, 1),
		// b: Renown only, no Mastery anywhere.
		row("b", "Holy", 0, 4),
	})
	require.NoError(t, err)
	require.Len(t, got, 2)

	a := got[0]
	require.Equal(t, "Shadow", a.PlayerSpec)
	require.Equal(t, 50.0, *a.Mastery)
	require.Equal(t, 60.0, *a.Peak)
	require.Equal(t, "dps", *a.ChosenMetric)
	require.Equal(t, 2.0*(3+2+1), a.Renown, "Renown adds every spec, Unknown included")

	b := got[1]
	require.Nil(t, b.Mastery)
	require.Empty(t, b.PlayerSpec)
	require.Equal(t, 8.0, b.Renown)
}
