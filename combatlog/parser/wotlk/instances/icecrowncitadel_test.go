package instances

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func TestIcecrownScriptedActivityIgnoresPutricideBalconyDamage(t *testing.T) {
	t.Parallel()

	putricide := creatureGUID(professorPutricideEntry)
	player := guid.GUID(1)
	at := time.Date(2026, time.October, 31, 20, 53, 33, 0, time.UTC)
	for _, spellName := range []string{"Vile Gas", "Malleable Goo"} {
		spellName := spellName
		t.Run(spellName, func(t *testing.T) {
			t.Parallel()
			damage := &messages.Damage{MessageBase: messages.Base(at), Caster: &putricide, Target: player, SpellName: &spellName}
			require.NoError(t, (&icecrownScriptedActivity{}).ProcessMessage(damage))
			_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, putricide)
			require.True(t, ignored)
		})
	}
}

func TestIcecrownScriptedActivitySuppressesResidualGunshipDamage(t *testing.T) {
	t.Parallel()

	preprocessor := &icecrownScriptedActivity{}
	ship := creatureGUID(orgrimsHammerEntry)
	cannon := guid.GUID(0xF150000000000001 | uint64(36838)<<24)
	at := time.Date(2026, time.November, 5, 20, 32, 50, 0, time.UTC)
	victory := &messages.Damage{MessageBase: messages.Base(at), Caster: &cannon, Target: ship, Amount: 1500, Overkill: 1290}
	require.NoError(t, preprocessor.ProcessMessage(victory))
	for _, unit := range []guid.GUID{ship, cannon} {
		_, ignored := victory.MarkHas(messages.MarkTypeIgnoreActivity, unit)
		require.True(t, ignored)
	}

	crew := creatureGUID(37148)
	residual := &messages.Damage{MessageBase: messages.Base(at.Add(time.Minute)), Caster: &crew, Target: guid.GUID(1), Amount: 1}
	require.NoError(t, preprocessor.ProcessMessage(residual))
	_, ignored := residual.MarkHas(messages.MarkTypeIgnoreActivity, crew)
	require.True(t, ignored)
}

func TestIcecrownScriptedActivityIgnoresDreamwalkersRageDamage(t *testing.T) {
	t.Parallel()

	valithria := creatureGUID(36789)
	add := creatureGUID(37868)
	at := time.Date(2026, time.October, 31, 21, 45, 1, 0, time.UTC)
	damage := &messages.Damage{MessageBase: messages.Base(at), Caster: &valithria, Target: add, SpellID: chrondbc.SpellID(dreamwalkersRageSpellID)}
	require.NoError(t, (&icecrownScriptedActivity{}).ProcessMessage(damage))
	for _, unit := range []guid.GUID{valithria, add} {
		_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, unit)
		require.True(t, ignored)
	}
}
