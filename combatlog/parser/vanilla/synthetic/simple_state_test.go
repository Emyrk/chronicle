package synthetic

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla/synthetic"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestSimpleSyntheticStateFlavorGates(t *testing.T) {
	t.Parallel()
	for _, plus := range []bool{false, true} {
		t.Run(map[bool]string{false: "vanilla", true: "plus"}[plus], func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorVanilla}
			if plus {
				flavor = append(flavor, database.FlavorVanillaPlus)
			}
			ctx := parsectx.With(t.Context(), parsectx.Context{Flavor: flavor})
			p := New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
			ts := time.Date(2026, time.October, 19, 12, 45, 5, 0, time.UTC)
			primary := guid.GUID(0xF130002CEE000001) // Ragnaros (11502)
			shadow := guid.GUID(0xF130009C44000001)  // Shadow (40004)
			unit := &messages.Unit{}
			unit.Guid = primary
			_, err := p.ProcessMessages([]messages.Message{unit, &messages.Slain{MessageBase: messages.Base(ts), Victim: guid.GUID(0xF130003EBD01598C)}})
			require.NoError(t, err)
			// Restore only this owner in place; this is not a full pipeline snapshot.
			bytes, err := p.razuvious.CaptureState().Encode()
			require.NoError(t, err)
			state, err := next.DecodeRazuviousState(next.RazuviousStateVersion, bytes)
			require.NoError(t, err)
			p.razuvious, err = state.Restore()
			require.NoError(t, err)
			damage := &messages.Damage{MessageBase: messages.Base(ts.Add(time.Second)), Caster: &shadow, Target: guid.GUID(0xF1300041A327A7DB), Amount: 20000}
			_, err = p.ProcessMessages([]messages.Message{damage})
			require.NoError(t, err)
			require.Equal(t, int32(1), damage.Amount) // Razuvious applies for both flavors.
			if plus {
				require.Equal(t, primary, *damage.Caster)
			} else {
				require.Equal(t, shadow, *damage.Caster)
			}
		})
	}
}

// This is deliberately not a scalar codec: the legacy owner keeps Unit aliases.
func TestVanillaPlusRetainsPrimaryUnitGUIDAlias(t *testing.T) {
	t.Parallel()
	v := newVanillaPlus()
	unit := &messages.Unit{}
	unit.Guid = guid.GUID(0xF130002CEE000001)
	v.ProcessMessages([]messages.Message{unit})
	require.Same(t, &unit.Guid, v.boss[11502])
	unit.Guid = guid.GUID(0xF130002CEE000002)
	shadow := guid.GUID(0xF130009C44000001)
	damage := &messages.Damage{Caster: &shadow}
	v.ProcessMessages([]messages.Message{damage})
	require.Equal(t, unit.Guid, *damage.Caster)
	require.NotSame(t, &unit.Guid, damage.Caster)
}
