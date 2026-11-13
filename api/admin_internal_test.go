package api

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

func TestAdminMinParserVersion(t *testing.T) {
	t.Parallel()

	t.Run("defaults to current parser version", func(t *testing.T) {
		t.Parallel()

		gotVersion, gotVersionNum := adminMinParserVersion("")
		require.Equal(t, version.ExactParserVersion(), gotVersion)
		require.Equal(t, semverenc.Encode(version.ExactParserVersion()), gotVersionNum)
	})

	t.Run("uses requested parser version", func(t *testing.T) {
		t.Parallel()

		gotVersion, gotVersionNum := adminMinParserVersion("v1.0.18+build")
		require.Equal(t, "v1.0.18+build", gotVersion)
		require.Equal(t, semverenc.Encode("v1.0.18+build"), gotVersionNum)
	})
}

func TestParseAdminLogDate(t *testing.T) {
	t.Parallel()

	start, ok := parseAdminLogDate("2026-02-05", false)
	require.True(t, ok)
	require.True(t, start.Valid)
	require.Equal(t, time.Date(2026, time.February, 5, 0, 0, 0, 0, time.UTC), start.Time)

	end, ok := parseAdminLogDate("2026-02-05", true)
	require.True(t, ok)
	require.Equal(t, time.Date(2026, time.February, 6, 0, 0, 0, 0, time.UTC), end.Time)

	empty, ok := parseAdminLogDate("", false)
	require.True(t, ok)
	require.False(t, empty.Valid)

	_, ok = parseAdminLogDate("02/05/2026", false)
	require.False(t, ok)
}
