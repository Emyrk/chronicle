package tbc_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type sourceSpellDB struct{}

func (sourceSpellDB) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, errors.New("not found")
}
func (sourceSpellDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return nil, nil
}

func tbcContext(t *testing.T) context.Context {
	t.Helper()
	return parsectx.With(t.Context(), parsectx.Context{
		Format: database.LogFormat243CcAddon,
		Flavor: database.WoWFlavor{database.FlavorTBC},
	})
}

func TestNativeSourceUsesTBCSuffixes(t *testing.T) {
	t.Parallel()
	line := `5/20 15:52:10.073  SWING_DAMAGE,0x000000000008DCCC,"Rhyd",0x10511,0xF130003D41000001,"Prince Malchezaar",0x10a48,250,1,5,0,10,1,nil,nil`
	pipeline, err := tbc.NewPipeline(tbcContext(t), nil, sourceSpellDB{})
	require.NoError(t, err)
	source, err := pipeline.OpenFile(strings.NewReader(line), 4096)
	require.NoError(t, err)
	decoded, err := source.Advance(t.Context())
	require.NoError(t, err)
	damage := decoded[0].(*messages.Damage)
	assert.Zero(t, damage.Overkill)
	assert.True(t, damage.HitType.Has(types.HitTypeCrit))
	assert.True(t, damage.HitType.Has(types.HitTypePartialResist))
}

func TestNativeSourceDoesNotRunTBCSynthetics(t *testing.T) {
	t.Parallel()
	const target = "0x0000000000000002"
	line := `5/20 15:52:11.073  SPELL_HEAL,` + target + `,"Tank",0x10511,` + target + `,"Tank",0x10511,379,"Earth Shield",0x8,700,nil`
	pipeline, err := tbc.NewPipeline(tbcContext(t), nil, sourceSpellDB{})
	require.NoError(t, err)
	source, err := pipeline.OpenFile(strings.NewReader(line), 4096)
	require.NoError(t, err)
	decoded, err := source.Advance(t.Context())
	require.NoError(t, err)
	heal := decoded[0].(*messages.Heal)
	assert.Equal(t, guid.GUID(2), heal.Caster)
	assert.Equal(t, guid.GUID(2), heal.Target)
}
