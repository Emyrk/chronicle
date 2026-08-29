package servicerankings

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSpeedrunUsesRankedTiming(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		value  string
		ranked bool
		valid  bool
	}{
		{name: "missing defaults to full raid", value: "", ranked: false, valid: true},
		{name: "full raid", value: "full", ranked: false, valid: true},
		{name: "boss time", value: "ranked", ranked: true, valid: true},
		{name: "invalid", value: "other", ranked: false, valid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ranked, valid := speedrunUsesRankedTiming(tt.value)
			assert.Equal(t, tt.ranked, ranked)
			assert.Equal(t, tt.valid, valid)
		})
	}
}
