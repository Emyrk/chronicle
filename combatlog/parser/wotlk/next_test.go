package wotlk

import (
	"context"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewNextNativeWrathSource(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(t.Context(), parsectx.Context{
		Format: database.LogFormat335aCcAddon,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	line := `1/14 20:40:08.481  SPELL_DAMAGE,0x00000000000019CA,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,1000,0,20,0,0,0,nil,nil,nil`
	source, err := NewNext(ctx, nil, strings.NewReader(line), auraTestDB{}, nil, nil)
	require.NoError(t, err)

	batch, err := source.Advance(ctx)
	require.NoError(t, err)
	var damage *messages.Damage
	for _, message := range batch {
		if decoded, ok := message.(*messages.Damage); ok {
			damage = decoded
			break
		}
	}
	require.NotNil(t, damage)
	assert.Equal(t, int32(1000), damage.Amount)
	assert.Equal(t, int64(1), source.Metrics().TotalLinesParsed)
	assert.Contains(t, source.DetailedTimes(), "parser.line_parse")
	assert.Contains(t, source.DetailedTimes(), "parser.synthetics")
}

func TestNewNextMalformedRecordParity(t *testing.T) {
	t.Parallel()
	const companionRecord = `1/14 20:40:08.481  SPELL_CAST_FAILED,invalid,"Mage",0x512,0x00000000000019CA,"Mage",0x512,1,"Companion",0x1,"[3Z:Dalaran,none,0,,0,0,0,571,0,]"`
	const malformedDamage = `1/14 20:40:08.481  SPELL_DAMAGE,invalid,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,1000,0,20,0,0,0,nil,nil,nil`
	const backwardRecord = `1/14 20:40:04.481  UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF1300023890000A9,"Target",0xa48,0,-1`
	for _, input := range []string{"invalid  ,", companionRecord, malformedDamage + "\n" + backwardRecord} {
		t.Run(input, func(t *testing.T) {
			t.Parallel()
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat335aCcAddon, Flavor: database.WoWFlavor{database.FlavorWrath}})
			old, err := NewLegacy(ctx, nil, strings.NewReader(input), auraTestDB{}, nil, nil)
			require.NoError(t, err)
			next, err := NewNext(ctx, nil, strings.NewReader(input), auraTestDB{}, nil, nil)
			require.NoError(t, err)
			for range strings.Split(input, "\n") {
				_, want := old.Advance(ctx)
				_, got := next.Advance(ctx)
				require.Error(t, want)
				require.EqualError(t, got, want.Error())
			}
		})
	}
}

func TestNewNextHonorsCanceledContext(t *testing.T) {
	t.Parallel()
	base := parsectx.With(t.Context(), parsectx.Context{
		Format: database.LogFormat335aCcAddon,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	source, err := NewNext(base, nil, strings.NewReader(""), auraTestDB{}, nil, nil)
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(base)
	cancel()
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, context.Canceled)
}
