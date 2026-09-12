package servicerankings

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRankingSummaryFastReadsOptionDefaultsDisabled(t *testing.T) {
	t.Parallel()

	service := New(nil)
	options := service.Options()
	require.Len(t, options, 1)

	option := options[0]
	assert.Equal(t, "ranking-summary-fast-reads", option.Flag)
	assert.Equal(t, "CHRONICLE_RANKING_SUMMARY_FAST_READS", option.Env)
	assert.Equal(t, "false", option.Default)
	assert.False(t, service.fastReadsEnabled)

	require.NoError(t, option.Value.Set("true"))
	assert.True(t, service.fastReadsEnabled)
}
