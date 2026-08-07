package realmclock_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/stretchr/testify/require"
)

func TestFromUnixOffset(t *testing.T) {
	t.Parallel()

	got := realmclock.FromUnixOffset(1716508800, -420)
	require.Equal(t, time.Date(2024, 5, 23, 17, 0, 0, 0, time.UTC), got.LocalTime)
	require.Equal(t, time.Date(2024, 5, 24, 0, 0, 0, 0, time.UTC), got.UTCTime)
	require.Equal(t, 7*time.Hour, got.Offset)
	require.Equal(t, time.Date(2024, 5, 24, 1, 30, 0, 0, time.UTC), got.Adjust(time.Date(2024, 5, 23, 18, 30, 0, 0, time.UTC)))
}

func TestClockInfo(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input string
		exp   realmclock.Info
	}{
		{
			// Central time UTC-6
			input: "CLOCK_INFO: 30.01.26 19:53:21&31.01.26 01:53:21",
			exp: realmclock.Info{
				LocalTime: time.Date(2026, 1, 30, 19, 53, 21, 0, time.UTC),
				UTCTime:   time.Date(2026, 1, 31, 1, 53, 21, 0, time.UTC),
				Offset:    time.Hour * 6,
			},
		},
	}

	for _, c := range cases {
		t.Run(c.input, func(t *testing.T) {
			t.Parallel()
			got, err := realmclock.ParseClockInfo(c.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			require.Equal(t, c.exp, got)
			require.Equal(t, c.input, got.String())
		})
	}
}
