package wotlk

import (
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type passthroughSynthetics struct{}

func (passthroughSynthetics) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	return msgs, nil
}

func TestTBCDamageSuffix(t *testing.T) {
	t.Parallel()

	line := `5/20 15:52:10.073  SWING_DAMAGE,0x000000000008DCCC,"Rhyd",0x10511,0xF130003D41000001,"Prince Malchezaar",0x10a48,250,1,5,0,10,1,nil,nil`
	parser, err := NewTBC(context.Background(), slog.Default(), strings.NewReader(line), auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)
	parser.SetSynthetics(passthroughSynthetics{})

	parsed, err := parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)

	damage, ok := parsed[0].(*messages.Damage)
	require.True(t, ok)
	assert.Equal(t, int32(250), damage.Amount)
	assert.Equal(t, int32(0), damage.Overkill)
	assert.Equal(t, types.PhysicalSchool, damage.School)
	assert.True(t, damage.HitType.Has(types.HitTypeCrit))
	assert.True(t, damage.HitType.Has(types.HitTypePartialResist))
	assert.True(t, damage.HitType.Has(types.HitTypePartialAbsorb))
}

func TestTBCHealSuffix(t *testing.T) {
	t.Parallel()

	line := `5/20 15:52:10.073  SPELL_HEAL,0x000000000008DCCC,"Rhyd",0x10511,0x000000000008DCCD,"Target",0x10511,25297,"Healing Wave",0x8,1200,1`
	parser, err := NewTBC(context.Background(), slog.Default(), strings.NewReader(line), auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)
	parser.SetSynthetics(passthroughSynthetics{})

	parsed, err := parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)

	heal, ok := parsed[0].(*messages.Heal)
	require.True(t, ok)
	assert.Equal(t, int32(1200), heal.Amount)
	assert.Equal(t, int32(0), heal.Overheal)
	assert.Equal(t, types.HitTypeCrit, heal.HitType)
	assert.Equal(t, types.NatureSchool, heal.School)
}

func TestTBCJudgementOfLightCreditsTarget(t *testing.T) {
	t.Parallel()

	line := `5/20 15:52:10.073  SPELL_HEAL,0x0000000000000001,"Paladin",0x10511,0x0000000000000002,"Attacker",0x10511,20267,"Localized spell name",0x2,61,nil`
	parser, err := NewTBC(context.Background(), slog.Default(), strings.NewReader(line), auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)

	parsed, err := parser.Advance(context.Background())
	require.NoError(t, err)

	var heal *messages.Heal
	for _, msg := range parsed {
		if typed, ok := msg.(*messages.Heal); ok {
			heal = typed
			break
		}
	}
	require.NotNil(t, heal)
	assert.Equal(t, heal.Target, heal.Caster)
}
