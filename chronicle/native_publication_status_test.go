package chronicle

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestNativePublicationPending(t *testing.T) {
	t.Parallel()
	base := database.ParserHandoff{NativeEnabled: true, Generation: 2, HeadIteration: 3, PublishedIteration: 3}
	job := &rivertype.JobRow{Kind: KindNativeLogParse, State: rivertype.JobStateRunning, EncodedArgs: []byte(`{"parse_generation":2}`)}
	require.True(t, nativePublicationPending(base, []*rivertype.JobRow{job}))
	job.State = rivertype.JobStateCompleted
	require.False(t, nativePublicationPending(base, []*rivertype.JobRow{job}))
	base.HeadIteration = 4
	require.True(t, nativePublicationPending(base, []*rivertype.JobRow{job}), "checkpoint acceptance is not publication")
	base.PublishedIteration = 4
	job.Kind = KindFinalizeLogParse
	job.State = rivertype.JobStateRunning
	require.True(t, nativePublicationPending(base, []*rivertype.JobRow{job}))
	job.EncodedArgs = []byte(`{"parse_generation":1}`)
	require.False(t, nativePublicationPending(base, []*rivertype.JobRow{job}))
	base.NativeEnabled = false
	base.HeadIteration = 5
	require.False(t, nativePublicationPending(base, []*rivertype.JobRow{job}))
}
