package instances

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestAssemblyRankedDamageClassifiesEachResolvedPhase(t *testing.T) {
	t.Parallel()

	hook := newAssemblyRankedDamage()
	encounterID := uuid.New()
	hook.FightStarted(encounterID, nil)

	steelbreaker := creatureGUID(32867)
	molgeim := creatureGUID(32927)
	brundir := creatureGUID(32857)
	player := guid.GUID(1)

	steelbreakerDamage := &messages.Damage{Caster: &player, Target: steelbreaker, Amount: 500}
	molgeimPadding := &messages.Damage{Caster: &player, Target: molgeim, Amount: 80}
	brundirPadding := &messages.Damage{Caster: &player, Target: brundir, Amount: 20}
	for _, damage := range []*messages.Damage{steelbreakerDamage, molgeimPadding, brundirPadding} {
		require.NoError(t, hook.ProcessMessage(true, encounterID, damage))
		require.True(t, damage.RankedDamagePending)
	}

	require.NoError(t, hook.ProcessMessage(true, encounterID, &messages.Slain{Victim: steelbreaker}))
	require.Equal(t, int64(500), *steelbreakerDamage.RankedDamage)
	require.Equal(t, int64(0), *molgeimPadding.RankedDamage)
	require.Equal(t, int64(0), *brundirPadding.RankedDamage)

	molgeimDamage := &messages.Damage{Caster: &player, Target: molgeim, Amount: 300}
	brundirSecondPhasePadding := &messages.Damage{Caster: &player, Target: brundir, Amount: 40}
	require.NoError(t, hook.ProcessMessage(true, encounterID, molgeimDamage))
	require.NoError(t, hook.ProcessMessage(true, encounterID, brundirSecondPhasePadding))
	require.NoError(t, hook.ProcessMessage(true, encounterID, &messages.Slain{Victim: molgeim}))
	require.Equal(t, int64(300), *molgeimDamage.RankedDamage)
	require.Equal(t, int64(0), *brundirSecondPhasePadding.RankedDamage)

	brundirDamage := &messages.Damage{Caster: &player, Target: brundir, Amount: 700}
	require.NoError(t, hook.ProcessMessage(true, encounterID, brundirDamage))
	require.NoError(t, hook.ProcessMessage(true, encounterID, &messages.Slain{Victim: brundir}))
	require.Equal(t, int64(700), *brundirDamage.RankedDamage)
}

func TestAssemblyRankedDamageLeavesUnresolvedPhaseUnclassified(t *testing.T) {
	t.Parallel()

	hook := newAssemblyRankedDamage()
	encounterID := uuid.New()
	hook.FightStarted(encounterID, nil)

	player := guid.GUID(1)
	damage := &messages.Damage{
		Caster: &player,
		Target: creatureGUID(32867),
		Amount: 500,
	}
	require.NoError(t, hook.ProcessMessage(true, encounterID, damage))
	hook.FightEnded(encounterID, nil)

	require.True(t, damage.RankedDamagePending)
	require.Nil(t, damage.RankedDamage)
}
