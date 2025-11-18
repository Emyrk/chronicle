package lines_test

import (
	"testing"
	"time"

	"github.com/chronicle/golangformat/golang/wowlogs/lines"
	"github.com/stretchr/testify/require"

	"github.com/coder/quartz"
)

func TestGuessYear(t *testing.T) {
	t.Parallel()

	clock := quartz.NewMock(t)
	newLiner := func() *lines.Liner {
		l := lines.NewLiner()
		l.SetClock(clock)

		_, _, err := l.Line("11/18 07:21:02.156  CAST: 0x00000000000E8AB6(Mooshuggah) casts Lesser Healing Wave(8004)(Rank 1) on 0x00000000000E8AB6(Mooshuggah).\n")
		require.NoError(t, err)
		return l
	}

	t.Run("date of log", func(t *testing.T) {
		clock.Set(time.Date(2025, 11, 19, 0, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2025, l.GetYear())
	})

	t.Run("technically the future, cause timezones", func(t *testing.T) {
		clock.Set(time.Date(2025, 11, 17, 19, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2025, l.GetYear())
	})

	t.Run("waited 2 months", func(t *testing.T) {
		// Waited 2 months to upload logs
		clock.Set(time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2025, l.GetYear())
	})

	t.Run("logs in future, but closer to future", func(t *testing.T) {
		clock.Set(time.Date(2026, 9, 19, 0, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2025, l.GetYear())
	})

	t.Run("close, but still future", func(t *testing.T) {
		clock.Set(time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2025, l.GetYear())
	})

	t.Run("2026 now", func(t *testing.T) {
		clock.Set(time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2026, l.GetYear())
	})

	t.Run("timezones make it technically in future", func(t *testing.T) {
		clock.Set(time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC))
		l := newLiner()
		require.Equal(t, 2026, l.GetYear())
	})
}
