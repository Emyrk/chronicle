package castv2_test

import (
	"testing"

	"github.com/Emyrk/chronicle/golang/internal/ptr"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/stretchr/testify/require"
)

func TestParseCast(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		input    string
		expError bool
		exp      castv2.CastV2
	}{
		{
			name:  "Fails",
			input: "CAST: Chotuk fails casting Firebolt(7800)(Rank 3).",
			exp: castv2.CastV2{
				Caster: types.Unit{
					Name: "Chotuk",
				},
				Action: types.CastActionsFailsCasting,
				Target: nil,
				Spell: types.Spell{
					Name: "Firebolt",
					ID:   7800,
					Rank: ptr.Ref(3),
				},
			},
		},
		{
			name:  "Teleport",
			input: "CAST: Gretti casts Teleport: Undercity(3563).",
			exp: castv2.CastV2{
				Caster: types.Unit{
					Name: "Gretti",
				},
				Action: types.CastActionsCasts,
				Spell: types.Spell{
					Name: "Teleport: Undercity",
					ID:   3563,
				},
			},
		},
		{
			name:  "BeginsTarget",
			input: "CAST: Maldrissa begins to cast Immolate(1094)(Rank 3) on Gray Bear.",
			exp: castv2.CastV2{
				Caster: types.Unit{
					Name: "Maldrissa",
				},
				Target: &types.Unit{
					Name: "Gray Bear",
				},
				Action: types.CastActionsBeginsToCast,
				Spell: types.Spell{
					Name: "Immolate",
					ID:   1094,
					Rank: ptr.Ref(3),
				},
			},
		},
		{
			name:  "CastsTarget",
			input: "CAST: Maldrissa casts Immolate(1094)(Rank 3) on Gray Bear.",
			exp: castv2.CastV2{
				Caster: types.Unit{
					Name: "Maldrissa",
				},
				Target: &types.Unit{
					Name: "Gray Bear",
				},
				Action: types.CastActionsCasts,
				Spell: types.Spell{
					Name: "Immolate",
					ID:   1094,
					Rank: ptr.Ref(3),
				},
			},
		},
		{
			name:  "ChannelsTarget",
			input: "CAST: Maldrissa channels Drain Life(689)(Rank 1) on Gray Bear.",
			exp: castv2.CastV2{
				Caster: types.Unit{
					Name: "Maldrissa",
				},
				Target: &types.Unit{
					Name: "Gray Bear",
				},
				Action: types.CastActionsChannels,
				Spell: types.Spell{
					Name: "Drain Life",
					ID:   689,
					Rank: ptr.Ref(1),
				},
			},
		},
		{
			name:  "RawCastsTarget",
			input: "CAST: 0xF140084493000090(Chotuk) begins to cast Firebolt(7800)(Rank 3) on 0xF13000092F003EDD(Gray Bear).",
			exp: castv2.CastV2{
				Caster: types.Unit{
					Name: "Chotuk",
					Gid:  0xF140084493000090,
				},
				Target: &types.Unit{
					Name: "Gray Bear",
					Gid:  0xF13000092F003EDD,
				},
				Action: types.CastActionsBeginsToCast,
				Spell: types.Spell{
					Name: "Firebolt",
					ID:   7800,
					Rank: ptr.Ref(3),
				},
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			p, err := castv2.ParseCast(c.input)
			if c.expError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.EqualValues(t, c.exp, p)
		})
	}
}
