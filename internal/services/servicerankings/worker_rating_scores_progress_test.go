package servicerankings

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestRatingPagesProcessedUsesOnlyCurrentGeneration(t *testing.T) {
	t.Parallel()
	generation := uuid.New()
	job := &river.Job[ArgsRebuildTenantRatings]{JobRow: &rivertype.JobRow{
		Metadata: []byte(fmt.Sprintf(`{"output":{"generation_id":%q,"pages_processed":64}}`, generation)),
	}}
	require.Equal(t, 96, ratingPagesProcessed(job, generation, 32))
	require.Equal(t, 32, ratingPagesProcessed(job, uuid.New(), 32), "new generation starts at zero")
	require.Equal(t, 32, ratingPagesProcessed(&river.Job[ArgsRebuildTenantRatings]{}, generation, 32))
	job.Metadata = []byte(`{"output":{"generation_id":"not-a-uuid","pages_processed":64}}`)
	require.Equal(t, 32, ratingPagesProcessed(job, generation, 32))
}
