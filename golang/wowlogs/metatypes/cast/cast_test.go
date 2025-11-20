package cast_test

import (
	"testing"

	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes/cast"
	"github.com/stretchr/testify/require"
)

func TestParseCast(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		input    string
		expError bool
		exp      cast.Cast
	}{
		{
			name:  "Fails",
			input: "CAST: Chotuk fails casting Firebolt(7800)(Rank 3).",
			exp: cast.Cast{
				Caster: metatypes.Unit{
					Name: "Chotuk",
				},
				Target: nil,
			},
		},
		{
			name:  "Teleport",
			input: "CAST: Gretti casts Teleport: Undercity(3563).",
			exp: cast.Cast{
				Caster: metatypes.Unit{
					Name: "Gretti",
				},
			},
		},
		{
			name:  "BeginsTarget",
			input: "CAST: Maldrissa begins to cast Immolate(1094)(Rank 3) on Gray Bear.",
			exp: cast.Cast{
				Caster: metatypes.Unit{
					Name: "Maldrissa",
				},
				Target: &metatypes.Unit{
					Name: "Gray Bear",
				},
			},
		},
		{
			name:  "CastsTarget",
			input: "CAST: Maldrissa casts Immolate(1094)(Rank 3) on Gray Bear.",
			exp: cast.Cast{
				Caster: metatypes.Unit{
					Name: "Maldrissa",
				},
				Target: &metatypes.Unit{
					Name: "Gray Bear",
				},
			},
		},
		{
			name:  "ChannelsTarget",
			input: "CAST: Maldrissa channels Drain Life(689)(Rank 1) on Gray Bear.",
			exp: cast.Cast{
				Caster: metatypes.Unit{
					Name: "Maldrissa",
				},
				Target: &metatypes.Unit{
					Name: "Gray Bear",
				},
			},
		},
		{
			name:  "RawCastsTarget",
			input: "CAST: 0xF140084493000090(Chotuk) begins to cast Firebolt(7800)(Rank 3) on 0xF13000092F003EDD(Gray Bear).",
			exp: cast.Cast{
				Caster: metatypes.Unit{
					Name: "Chotuk",
					Gid:  0xF140084493000090,
				},
				Target: &metatypes.Unit{
					Name: "Gray Bear",
					Gid:  0xF13000092F003EDD,
				},
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			p, err := cast.ParseCast(c.input)
			if c.expError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.EqualValues(t, c.exp, p)
		})
	}
}
