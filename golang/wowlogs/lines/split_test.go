package lines_test

import (
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
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

func TestLinerRoundTrip(t *testing.T) {
	t.Parallel()

	cases := `11/18 07:20:46.282  CAST: 0x00000000000E8AB6(Mooshuggah) casts Flame Shock(8052)(Rank 2) on 0xF13000092F00408E(Gray Bear).
11/18 07:20:49.561  CAST: 0x00000000000E8AB6(Mooshuggah) casts Lightning Strike(51387)(Rank 1) on 0xF13000092F00408E(Gray Bear).
11/18 07:20:49.561  CAST: 0x00000000000E8AB6(Mooshuggah) casts Flurry(16257)(Rank 1) on 0x00000000000E8AB6(Mooshuggah).
10/29 22:31:59.617  Cigan casts Strength of Earth Totem.
10/29 22:31:59.617  Strength of Earth Totem V casts Strength of Earth on Strength of Earth Totem V.
10/29 22:31:59.617  Cigan casts Strength of Earth Totem.
10/29 22:31:59.617  Firesworn hits Corta for 696.
10/29 22:31:59.706  Corta casts Flametongue Attack on Firesworn.
10/29 22:31:59.706  Corta 's Flametongue Attack hits Firesworn for 13 Fire damage.
10/29 22:31:59.706  Corta casts Clearcasting on Corta.
10/29 22:31:59.706  Corta hits Firesworn for 311.
10/29 22:31:59.706  Firesworn hits Blackwingz for 705.
10/29 22:31:59.716  Corta gains Windfury Totem (1).
10/29 22:31:59.716  Corta gains Clearcasting (1).
10/29 22:31:59.782  Cigan casts Flametongue Totem.
10/29 22:31:59.782  Cigan casts Flametongue Totem.
10/29 22:31:59.922  Riczaocrl begins to cast Arcane Rupture.
10/29 22:31:59.922  Bling gains 8 Mana from Bling 's Water Shield.
10/29 22:31:59.922  Lonsell casts Repentance on Garr.
10/29 22:31:59.922  Lonsell 's Repentance fails. Garr is immune.
10/29 22:31:59.922  Lonsell casts Repent on Garr.
10/29 22:31:59.922  Firesworn hits Blackwingz for 584.
10/29 22:31:59.922  Garr is afflicted by Repent (1).
10/29 22:32:00.013  Lhian begins to cast Flash of Light.
10/29 22:32:00.013  Corta casts Challenging Roar.`

	lns := strings.Split(cases, "\n")
	liner := lines.NewLiner()
	for _, line := range lns {
		ts, content, err := liner.Line(line)
		require.NoError(t, err, content)
		serialized := liner.FmtLine(ts, content)
		require.Equal(t, line, serialized, content)
	}
}
