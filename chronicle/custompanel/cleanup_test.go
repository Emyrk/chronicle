package custompanel_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/custompanel"
	"github.com/stretchr/testify/require"
)

func TestMidnightUTCSchedule(t *testing.T) {
	t.Parallel()
	schedule := custompanel.MidnightUTCSchedule{}
	current := time.Date(2026, time.October, 7, 23, 59, 0, 0, time.FixedZone("west", -7*60*60))
	require.Equal(t, time.Date(2026, time.October, 9, 0, 0, 0, 0, time.UTC), schedule.Next(current))
}
