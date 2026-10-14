package servicerankings

import (
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseLiveTimeParseWindow(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, time.October, 14, 18, 30, 0, 0, time.UTC)

	t.Run("defaults to today UTC and sixty days", func(t *testing.T) {
		window, err := parseLiveTimeParseWindow(url.Values{}, true, now)
		require.NoError(t, err)
		assert.Equal(t, time.Date(2026, time.October, 14, 0, 0, 0, 0, time.UTC), window.Cutoff)
		assert.Equal(t, int32(60), window.LookbackDays)
		assert.Equal(t, time.Date(2026, time.August, 15, 0, 0, 0, 0, time.UTC), window.WindowStart.Time)
	})

	t.Run("uses selected date and all time", func(t *testing.T) {
		window, err := parseLiveTimeParseWindow(url.Values{"date": {"2025-01-02"}, "period": {"all"}}, true, now)
		require.NoError(t, err)
		assert.Equal(t, time.Date(2025, time.January, 2, 0, 0, 0, 0, time.UTC), window.Cutoff)
		assert.Equal(t, int32(0), window.LookbackDays)
		assert.False(t, window.WindowStart.Valid)
	})

	t.Run("rejects date for instance endpoint", func(t *testing.T) {
		_, err := parseLiveTimeParseWindow(url.Values{"date": {"2025-01-02"}}, false, now)
		require.Error(t, err)
	})

	t.Run("rejects invalid period", func(t *testing.T) {
		_, err := parseLiveTimeParseWindow(url.Values{"period": {"7d"}}, true, now)
		require.Error(t, err)
	})
}
