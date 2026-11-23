package serviceratings

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestArmoryRealmCareerActivation(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.exec(`UPDATE tenants SET slug='capy',additional_flavor=ARRAY['vanilla'] WHERE id=$1`, s.tenant)
	s.exec(`UPDATE wow_server_realms SET name='Eversong Wilds' WHERE id=$1`, s.realm)
	mc := leaderboardconfig.CareerKey{Instance: "Molten Core"}
	local := database.ReplaceLeaderboardPlayerRenownFactParams{TenantID: s.tenant, RealmID: s.realm, InstanceName: mc.Instance, EncounterName: "Lucifron", RunID: uuid.New(), SourceInstanceID: uuid.New(), SourceEncounterID: uuid.New(), PlayerGuid: "SomeoneElse"}
	insert := func(f database.ReplaceLeaderboardPlayerRenownFactParams) {
		s.db.ReplaceLeaderboardPlayerRenownFact(ctx, []database.ReplaceLeaderboardPlayerRenownFactParams{f}).Exec(func(_ int, err error) { require.NoError(t, err) })
	}
	insert(local)
	remote := local
	remote.RealmID = uuid.New()
	remote.RunID = uuid.New()
	remote.InstanceName = "Blackwing Lair"
	remote.EncounterName = "Razorgore the Untamed"
	insert(remote)
	pool, err := CareerConfiguration(ctx, s.db, s.tenant)
	require.NoError(t, err)
	inputs, err := json.Marshal(CareerInputs{Raids: []CareerRaidInput{{CareerKey: mc, Metric: "dps", Mastery: 80, Peak: 90, EligibleKills: 1, Parts: true}}, Kills: []CareerBossKills{{CareerKey: mc, Boss: "Lucifron", Count: 1}}})
	require.NoError(t, err)
	s.exec(`INSERT INTO leaderboard_career_subjects(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec,chosen_metric,inputs,pool_fingerprint) VALUES($1,'player',$2,'Player','MAGE','Frost','','dps',$3,$4)`, s.tenant, s.realm, string(inputs), pool.Fingerprint)
	global, err := ReadPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Len(t, global.Cohorts, 1)
	require.InDelta(t, 80.0*3/7, *global.Cohorts[0].Mastery, 0.00001)
	require.Len(t, global.Cohorts[0].Contributions, 2)
	require.False(t, global.Cohorts[0].RefreshPending)
	for _, realmName := range []string{"Eversong Wilds", "Basin of Stars"} {
		s.exec(`UPDATE wow_server_realms SET name=$2 WHERE id=$1`, s.realm, realmName)
		armory, err := ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
		require.NoError(t, err)
		require.Len(t, armory.Cohorts, 1)
		require.Equal(t, 80.0, *armory.Cohorts[0].Mastery)
		require.Equal(t, 90.0, *armory.Cohorts[0].Peak)
		require.Len(t, armory.Cohorts[0].Contributions, 1)
		require.Equal(t, global.Cohorts[0].Renown, armory.Cohorts[0].Renown)
		require.Equal(t, global.Cohorts[0].ChosenMetric, armory.Cohorts[0].ChosenMetric)
		require.NotEqual(t, global.PoolFingerprint, armory.PoolFingerprint)
		require.False(t, armory.Cohorts[0].RefreshPending, "display-only policy must not imply a stale worker")
	}
	// Neither another Capy realm nor the same realm name on another tenant opts in.
	s.exec(`UPDATE wow_server_realms SET name='Other realm' WHERE id=$1`, s.realm)
	ordinary, err := ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, global, ordinary)
	s.exec(`UPDATE wow_server_realms SET name='Eversong Wilds' WHERE id=$1`, s.realm)
	s.exec(`UPDATE tenants SET slug='other' WHERE id=$1`, s.tenant)
	ordinary, err = ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, global, ordinary)
	s.exec(`UPDATE tenants SET slug='capy' WHERE id=$1`, s.tenant)
	// Any realm-local eligible boss kill unlocks the raid for EVERY character,
	// including characters without that raid. No full clear or worker pass required.
	localBWL := remote
	localBWL.RunID = uuid.New()
	localBWL.RealmID = s.realm
	insert(localBWL)
	unlocked, err := ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, *global.Cohorts[0].Mastery, *unlocked.Cohorts[0].Mastery)
	require.False(t, unlocked.Cohorts[0].RefreshPending)
	require.NoError(t, s.db.DeleteLeaderboardRunEvidence(ctx, database.DeleteLeaderboardRunEvidenceParams{TenantID: s.tenant, RunID: localBWL.RunID}))
	retracted, err := ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, 80.0, *retracted.Cohorts[0].Mastery)
	// Guild-only evidence has the same activation behavior as player evidence.
	guildRun := uuid.New()
	s.db.ReplaceLeaderboardGuildRenownFact(ctx, []database.ReplaceLeaderboardGuildRenownFactParams{{TenantID: s.tenant, RealmID: s.realm, InstanceName: remote.InstanceName, EncounterName: remote.EncounterName, RunID: guildRun, SourceInstanceID: uuid.New(), SourceEncounterID: uuid.New(), GuildID: uuid.New()}}).Exec(func(_ int, err error) { require.NoError(t, err) })
	unlocked, err = ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, *global.Cohorts[0].Mastery, *unlocked.Cohorts[0].Mastery)
	// A realm with no eligible evidence has no denominator, rather than a zero rating.
	require.NoError(t, s.db.DeleteLeaderboardRunEvidence(ctx, database.DeleteLeaderboardRunEvidenceParams{TenantID: s.tenant, RunID: guildRun}))
	require.NoError(t, s.db.DeleteLeaderboardRunEvidence(ctx, database.DeleteLeaderboardRunEvidenceParams{TenantID: s.tenant, RunID: local.RunID}))
	empty, err := ReadArmoryPlayerCareer(ctx, s.db, s.tenant, s.realm, "Player")
	require.NoError(t, err)
	require.Equal(t, "no_active_raids", empty.Status)
	require.Nil(t, empty.Cohorts[0].Mastery)
	require.Empty(t, empty.Cohorts[0].Contributions)
}
