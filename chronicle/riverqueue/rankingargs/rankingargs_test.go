package rankingargs

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNormalizeIDs(t *testing.T) {
	t.Parallel()
	first := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	second := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	assert.Equal(t, []uuid.UUID{first, second}, NormalizeIDs([]uuid.UUID{
		second, uuid.Nil, first, second, first,
	}))
	assert.Equal(t,
		NewRefreshRankingRuns(second, first, second),
		NewRefreshRankingRuns(first, second),
	)
}
