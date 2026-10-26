package chronicle

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRunStillPageURL(t *testing.T) {
	t.Parallel()

	id := uuid.MustParse("c8299228-7a8e-4767-8f18-1ba131169dd0")

	got, err := runStillPageURL("https://chronicleclassic.com/", "", "chronicleclassic.com", id)
	require.NoError(t, err)
	require.Equal(t, "https://chronicleclassic.com/render/run-still/"+id.String(), got)

	// A tenant's run renders on the tenant's own site, as its OG URL does.
	got, err = runStillPageURL("https://chronicleclassic.com", "forever", "chronicleclassic.com", id)
	require.NoError(t, err)
	require.Equal(t, "https://forever.chronicleclassic.com/render/run-still/"+id.String(), got)
}
