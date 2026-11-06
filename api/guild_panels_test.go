package api

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/stretchr/testify/require"
)

func TestGuildBestRunsWindow(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		input         string
		wantSinceDays int64
		wantLookback  int32
	}{
		{name: "missing uses default", wantSinceDays: int64(parsepolicy.DefaultLookbackDays), wantLookback: int32(parsepolicy.DefaultLookbackDays)},
		{name: "invalid uses default", input: "invalid", wantSinceDays: int64(parsepolicy.DefaultLookbackDays), wantLookback: int32(parsepolicy.DefaultLookbackDays)},
		{name: "negative uses default", input: "-1", wantSinceDays: int64(parsepolicy.DefaultLookbackDays), wantLookback: int32(parsepolicy.DefaultLookbackDays)},
		{name: "zero uses default", input: "0", wantSinceDays: int64(parsepolicy.DefaultLookbackDays), wantLookback: int32(parsepolicy.DefaultLookbackDays)},
		{name: "explicit window", input: "90", wantSinceDays: 90, wantLookback: 90},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			sinceDays, lookbackDays := guildBestRunsWindow(tc.input)
			require.Equal(t, tc.wantSinceDays, sinceDays)
			require.Equal(t, tc.wantLookback, lookbackDays)
		})
	}
}
