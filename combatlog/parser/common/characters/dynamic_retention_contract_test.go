package characters

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/require"
)

// Demonstrate the documented open-interface boundary, rather than claiming the
// concrete codec table certifies every event that can complete delayed defeat.
func TestDynamicEvadeRetentionRemainsExplicit(t *testing.T) {
	t.Parallel()
	at := time.Unix(100, 0).UTC()
	common := NewCommonCharacter(42, NewCharacters(unitdb.New(), nil, nil))
	wrapped := NewScriptedDefeatCharacter(42, common, ScriptedDefeatConfig{Evade: true, EvadeConfirmationWindow: time.Second})
	common.Start("active", messages.TimedOut(at))
	require.NoError(t, wrapped.Process(&messages.Damage{MessageBase: messages.Base(at), Target: 42, HitType: types.HitTypeEvade}))
	unsupported := &messages.SpellFail{MessageBase: messages.Base(at.Add(2 * time.Second)), Caster: 42}
	require.NoError(t, wrapped.Process(unsupported))
	require.False(t, common.IsActive())
	require.Same(t, unsupported, common.LastSlain)
	_, err := period.CaptureMoment(common.Periods()[0].End, func(messages.Message) (string, error) { return "event", nil })
	require.ErrorContains(t, err, "unsupported resolved retained message *messages.SpellFail")
}
