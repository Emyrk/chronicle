package unitinfo_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/stretchr/testify/require"
)

func TestParseUnitInfo(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input string
		exp   unitinfo.Info
	}{
		{
			input: "UNIT_INFO: 17.01.26 20:34:44&0xF130002FE800DD20&0&Shazzrah&0&&-1na",
			exp: unitinfo.Info{
				Seen:         time.Date(2026, 1, 17, 20, 34, 44, 0, time.UTC),
				Guid:         0xF130002FE800DD20,
				IsPlayer:     false,
				Name:         "Shazzrah",
				CanCooperate: false,
				Owner:        nil,
				Level:        0,
				Buffs:        nil,
				Challenges:   nil,
			},
		},
		{
			input: "UNIT_INFO: 17.01.26 19:54:19&0xF130002D9401648A&0&Firelord&0&&62na",
			exp: unitinfo.Info{
				Seen:         time.Date(2026, 1, 17, 19, 54, 19, 0, time.UTC),
				Guid:         0xF130002D9401648A,
				IsPlayer:     false,
				Name:         "Firelord",
				CanCooperate: false,
				Owner:        nil,
				Level:        0,
			},
		},
		{
			input: "UNIT_INFO: 17.01.26 19:54:44&0xF130001CF827932C&0&Mana Spring Totem IV&1&0x000000000007C4E9&,10494=160na",
			exp: unitinfo.Info{
				Seen:         time.Date(2026, 1, 17, 19, 54, 44, 0, time.UTC),
				Guid:         0xF130001CF827932C,
				IsPlayer:     false,
				Name:         "Mana Spring Totem IV",
				CanCooperate: true,
				Owner:        ptr.Ref(guid.GUID(0x000000000007C4E9)),
				Buffs: []unitinfo.Buff{
					{ID: 10494, Applications: 160},
				},
				Challenges: nil,
			},
		},
		{
			input: "UNIT_INFO: 01.12.25 18:08:55&0xF1300022D5000EA4&0&Quarry Slave&0&&",
			exp: unitinfo.Info{
				Seen:         time.Date(2025, 12, 1, 18, 8, 55, 0, time.UTC),
				Guid:         0xF1300022D5000EA4,
				IsPlayer:     false,
				Name:         "Quarry Slave",
				CanCooperate: false,
				Owner:        nil,
				Buffs:        make([]unitinfo.Buff, 0),
				Challenges:   nil,
			},
		},
		{
			input: "UNIT_INFO: 17.01.26 19:58:23&0xF13000CBB2279364&0&Small Incendic Egg&0&&",
			exp: unitinfo.Info{
				Seen:         time.Date(2026, 1, 17, 19, 58, 23, 0, time.UTC),
				Guid:         0xF13000CBB2279364,
				IsPlayer:     false,
				Name:         "Small Incendic Egg",
				CanCooperate: false,
				Owner:        nil,
				Buffs:        make([]unitinfo.Buff, 0),
				Challenges:   nil,
			},
		},
		{
			input: "UNIT_INFO: 17.01.26 20:34:55&0x00000000000AB913&0&Briene&1&&,25895=1,21850=1,25899=1,17538=1,25782=1,51670=160na",
			exp: unitinfo.Info{
				Seen:         time.Date(2026, 1, 17, 20, 34, 55, 0, time.UTC),
				Guid:         0x00000000000AB913,
				IsPlayer:     false,
				Name:         "Briene",
				CanCooperate: true,
				Owner:        nil,
				Buffs: []unitinfo.Buff{
					{ID: 25895, Applications: 1},
					{ID: 21850, Applications: 1},
					{ID: 25899, Applications: 1},
					{ID: 17538, Applications: 1},
					{ID: 25782, Applications: 1},
					{ID: 51670, Applications: 160},
				},
				Challenges: nil,
			},
		},
	}

	for _, c := range cases {
		t.Run(c.input, func(t *testing.T) {
			t.Parallel()
			got, err := unitinfo.ParseUnitInfo(nil, c.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			require.Equal(t, c.exp, got)
		})
	}
}
