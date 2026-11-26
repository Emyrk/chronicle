package serviceratings

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLunaticUnknownSpecCareerRenown(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	// Model the persisted result of an eligible level-one kill with no talents.
	// Parser level eligibility is covered by TestShouldRecordDPSRankings.
	s.exec(`UPDATE tenants SET additional_flavor=ARRAY['vanilla','nightmare-of-ursol','lunatic'] WHERE id=$1`, s.tenant)
	s.exec(`UPDATE log_instances SET name='Deadmines', difficulty_name='', max_players=0 WHERE id=$1`, s.instance)
	s.exec(`UPDATE log_instance_encounters SET name='Edwin VanCleef' WHERE id=$1`, s.encounter)
	s.exec(`UPDATE ranking_runs SET instance_name='Deadmines', difficulty_name='', max_players=0 WHERE run_id=$1`, s.run)
	s.exec(`UPDATE encounter_dps_rankings SET instance_name='Deadmines', encounter_name='Edwin VanCleef', difficulty_name='', max_players=0, player_spec='Unknown' WHERE instance_id=$1`, s.instance)
	rows := s.compute()
	var careerFacts int
	for _, row := range rows {
		require.NotEqualValues(t, 1, row.Kind, "Unknown spec must not fabricate a performance observation")
		if row.Kind == 6 {
			careerFacts++
			require.Equal(t, "MAGE", row.PlayerClass)
			require.Equal(t, "Unknown", row.PlayerSpec)
			require.Empty(t, row.PlayerSubSpec)
		}
	}
	require.Equal(t, 1, careerFacts)
	require.NoError(t, s.direct(rows))
	for family := Family(0); family < familyCount; family++ {
		_, err := (&Worker{Store: s.db}).Drain(ctx, s.tenant, family)
		require.NoError(t, err)
	}
	makeCareerDue(s)
	_, err := (&CareerWorker{Store: s.db}).Drain(ctx, s.tenant)
	require.NoError(t, err)
	armory, err := ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Len(t, armory.Cohorts, 1)
	cohort := armory.Cohorts[0]
	require.Equal(t, "MAGE", cohort.PlayerClass)
	require.Equal(t, "Unknown", cohort.PlayerSpec)
	require.Equal(t, 2.0, cohort.Renown)
	require.Nil(t, cohort.Mastery)
	require.Nil(t, cohort.Peak)
	require.False(t, cohort.RefreshPending)

	// An unrelated realm must not activate the dungeon's Armory denominator.
	other, err := leaderboardconfig.ResolveCareerInRealm(ctx, s.db, s.tenant, uuid.New(), database.WoWFlavor{database.FlavorVanilla}, database.WoWFlavor{database.FlavorLunatic, database.FlavorNightmareOfUrsol})
	require.NoError(t, err)
	for _, variant := range other.Variants {
		require.False(t, variant.Active)
	}
}
