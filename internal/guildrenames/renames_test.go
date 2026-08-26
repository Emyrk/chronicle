package guildrenames

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestResolve(t *testing.T) {
	t.Parallel()

	cutoff := time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		realm   string
		logTime time.Time
		guild   string
		want    string
	}{
		{
			name:    "renames historical Levia logs on N'Zoth",
			realm:   "N'Zoth",
			logTime: cutoff.Add(-time.Nanosecond),
			guild:   "Levia",
			want:    "Remnant",
		},
		{
			name:    "does not rename logs at the cutoff",
			realm:   "N'Zoth",
			logTime: cutoff,
			guild:   "Levia",
			want:    "Levia",
		},
		{
			name:    "does not rename on another realm",
			realm:   "Unknown",
			logTime: cutoff.Add(-time.Hour),
			guild:   "Levia",
			want:    "Levia",
		},
		{
			name:    "does not rename another guild",
			realm:   "N'Zoth",
			logTime: cutoff.Add(-time.Hour),
			guild:   "Another Guild",
			want:    "Another Guild",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, Resolve(tt.realm, tt.logTime, tt.guild))
		})
	}
}
