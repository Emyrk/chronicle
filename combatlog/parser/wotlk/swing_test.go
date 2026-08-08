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

func TestSwingDamagePetOutcomes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		suffix  string
		amount  int32
		hitType types.HitType
	}{
		{name: "normal", suffix: "250,0,1,0,0,0,nil,nil,nil", amount: 250, hitType: types.HitTypeHit},
		{name: "glancing", suffix: "229,0,1,0,0,0,nil,1,nil", amount: 229, hitType: types.HitTypeGlancing},
		{name: "critical", suffix: "808,0,1,0,0,0,1,nil,nil", amount: 808, hitType: types.HitTypeCrit},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			line := `8/8 18:43:42.478  SWING_DAMAGE,0xF140002C37000009,"Jhuughun",0x1111,0xF1300043490001E0,"Nightbane",0x10a48,` + tt.suffix
			parser, err := New(context.Background(), slog.Default(), strings.NewReader(line), auraTestDB{}, auraTestDB{}, nil)
			require.NoError(t, err)

			parsed, err := parser.Advance(context.Background())
			require.NoError(t, err)

			var damage *messages.Damage
			for _, msg := range parsed {
				if candidate, ok := msg.(*messages.Damage); ok {
					damage = candidate
					break
				}
			}
			require.NotNil(t, damage)
			require.NotNil(t, damage.Caster)
			assert.Equal(t, "0xF140002C37000009", damage.Caster.String())
			assert.Equal(t, "0xF1300043490001E0", damage.Target.String())
			assert.Equal(t, "Auto Attack", damage.SourceName())
			assert.Equal(t, tt.amount, damage.Amount)
			assert.Equal(t, tt.hitType, damage.HitType)
			assert.Equal(t, types.PhysicalSchool, damage.School)
		})
	}
}
