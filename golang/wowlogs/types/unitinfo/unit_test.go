package unitinfo_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/types/unitinfo"
	"github.com/stretchr/testify/require"
)

func TestParseUnitInfo(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input string
		exp   unitinfo.Info
	}{
		{
			input: "UNIT_INFO: 01.12.25 18:08:55&0xF1300022D5000EA4&0&Quarry Slave&0&&",
			exp: unitinfo.Info{
				Seen:         time.Date(2025, 12, 1, 18, 8, 55, 0, time.UTC),
				Guid:         0xF1300022D5000EA4,
				IsPlayer:     false,
				Name:         "Quarry Slave",
				CanCooperate: false,
				Owner:        nil,
			},
		},
	}

	for _, c := range cases {
		t.Run(c.input, func(t *testing.T) {
			t.Parallel()
			got, err := unitinfo.ParseUnitInfo(c.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			require.Equal(t, c.exp, got)
		})
	}
}
