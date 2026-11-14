package modern

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type stateSpells struct{}

func (stateSpells) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	panic("unexpected runtime spell access")
}
func (stateSpells) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	panic("unexpected runtime spell access")
}
func TestModernDecoderState(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatV22Cleu, Flavor: database.WoWFlavor{database.FlavorWoWForever}})
	d, e := NewDecoder(ctx, DecoderOptions{Spells: stateSpells{}, Hooks: cleu.Hooks{LookupSpell: func(chrondbc.SpellID, ...string) *chrondbc.Spell { panic("unexpected lookup") }}})
	require.NoError(t, e)
	_, e = d.NormalizeLine(`9/3/2026 12:00:00.000+0  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0`)
	require.NoError(t, e)
	_, e = d.NormalizeLine(`9/3/2026 12:00:01.000+0  SWING_DAMAGE,Player-2-00000001,"One-Realm",0x514,0,Creature-0-1-564-1-1-1,"Boss",0,0,1,1,-1,1,0,0,0,nil,nil,nil`)
	require.NoError(t, e)
	state, e := d.CaptureState()
	require.NoError(t, e)
	before, e := state.Encode()
	require.NoError(t, e)
	d.normalizer.transform.names["changed"] = "changed"
	after, e := state.Encode()
	require.NoError(t, e)
	require.Equal(t, before, after)
	decoded, e := DecodeState(StateVersion, before)
	require.NoError(t, e)
	a, e := decoded.Restore()
	require.NoError(t, e)
	b, e := decoded.Restore()
	require.NoError(t, e)
	require.Same(t, a.normalizer.transform.guids, a.handlers.GUIDs)
	a.normalizer.transform.names["mutated"] = "mutated"
	require.NotContains(t, b.normalizer.transform.names, "mutated")
	require.NoError(t, b.WireGraphRuntime(ctx, DecoderOptions{Spells: stateSpells{}, Hooks: cleu.Hooks{LookupSpell: func(chrondbc.SpellID, ...string) *chrondbc.Spell { panic("unexpected lookup") }}}))
	_, e = b.DecodeNormalized(time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC), `9/3 12:00:00.000  BLIZZARD_ENCOUNTER_START,1,"Boss",1,5`)
	require.NoError(t, e)
	for _, bad := range []string{`null`, `{}`, string(before) + ` {}`, strings.Replace(string(before), `"handler_version":22`, `"handler_version":22,"handler_version":22`, 1), strings.Replace(string(before), `"handler_version":22`, `"handler_version":7`, 1)} {
		_, e := DecodeState(StateVersion, []byte(bad))
		require.Error(t, e)
	}
	_, e = DecodeState(StateVersion+1, before)
	require.Error(t, e)
}
