package servicerankings

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRankingDifficultyNamesPreservesExactEmptyCohort(t *testing.T) {
	t.Parallel()
	require.Nil(t, rankingDifficultyNames(url.Values{"difficulty_names": {""}}))
	require.Equal(t, []string{""}, rankingDifficultyNames(url.Values{"exact_cohort": {"true"}, "difficulty_names": {""}}))
	require.Equal(t, []string{"Normal"}, rankingDifficultyNames(url.Values{"exact_cohort": {"true"}, "difficulty_names": {"Normal"}}))
}
