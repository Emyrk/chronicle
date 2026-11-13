package wotlk_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
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

func wrathContext(t *testing.T) context.Context {
	t.Helper()
	return parsectx.With(t.Context(), parsectx.Context{
		Format: database.LogFormat335aCcAddon,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
}

func TestNativeSourceRequiresResolvedParseContext(t *testing.T) {
	t.Parallel()
	_, err := wotlk.NewPipeline(t.Context(), nil, sourceSpellDB{})
	require.ErrorContains(t, err, "parsectx")

	ctx := parsectx.With(t.Context(), parsectx.Context{
		Format: database.LogFormatAzerothcoreMod,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	_, err = wotlk.NewPipeline(ctx, nil, sourceSpellDB{})
	require.ErrorContains(t, err, "native Wrath source")
}

func TestNativeSourceDecodesMessagesAndOwnsClockOrdering(t *testing.T) {
	t.Parallel()
	lines := strings.Join([]string{
		`1/14 20:40:08.481  SPELL_DAMAGE,0x00000000000019CA,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,1000,0,20,0,0,0,nil,nil,nil`,
		`1/14 20:40:04.481  UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF1300023890000A9,"Target",0xa48,0,-1`,
	}, "\n")
	pipeline, err := wotlk.NewPipeline(wrathContext(t), nil, sourceSpellDB{})
	require.NoError(t, err)
	pipeline.SetBaseYear(2026)
	source, err := pipeline.OpenFile(strings.NewReader(lines), 4096)
	require.NoError(t, err)

	decoded, err := source.Advance(t.Context())
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	damage := decoded[0].(*messages.Damage)
	assert.Equal(t, 2026, damage.Date().Year())
	assert.Equal(t, int32(1000), damage.Amount)
	name, ok := pipeline.GUIDName(guid.GUID(0x00000000000019CA))
	require.True(t, ok)
	assert.Equal(t, "Mage", name)

	_, err = source.Advance(t.Context())
	require.Error(t, err)
}

func TestNativeSourceDecodesCompanionFramesWithoutSynthetics(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:08.481  SPELL_CAST_FAILED,0x00000000000019CA,"Mage",0x512,0x00000000000019CA,"Mage",0x512,1,"Companion",0x1,"[3Z:Dalaran,none,0,,0,0,0,571,0,]"`
	pipeline, err := wotlk.NewPipeline(wrathContext(t), nil, sourceSpellDB{})
	require.NoError(t, err)
	source, err := pipeline.OpenFile(strings.NewReader(line), 4096)
	require.NoError(t, err)
	decoded, err := source.Advance(t.Context())
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	zone := decoded[0].(*messages.Zone)
	assert.Equal(t, "dalaran", zone.Name)
	assert.Equal(t, uint32(571), zone.MapID)
	_, err = source.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
}
