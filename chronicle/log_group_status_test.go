package chronicle

import (
	"testing"

	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestLogGroupStatusJob(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name            string
		kind            string
		state           rivertype.JobState
		args, metadata  string
		wantPublication bool
	}{
		{"completed producer", KindNativeLogParse, rivertype.JobStateCompleted, `{"parse_generation":2}`, `{}`, true},
		{"completed no-op finalizer", KindFinalizeLogParse, rivertype.JobStateCompleted, `{"parse_generation":2}`, `{}`, true},
		{"active producer", KindNativeLogParse, rivertype.JobStateRunning, `{"parse_generation":2}`, `{}`, false},
		{"failed finalizer", KindFinalizeLogParse, rivertype.JobStateRetryable, `{"parse_generation":2}`, `{}`, false},
		{"new generation", KindNativeLogParse, rivertype.JobStateCompleted, `{"parse_generation":3}`, `{}`, false},
		{"malformed args", KindNativeLogParse, rivertype.JobStateCompleted, `{`, `{}`, false},
		{"missing generation", KindNativeLogParse, rivertype.JobStateCompleted, `{}`, `{}`, false},
		{"legacy unchanged", KindLogParse, rivertype.JobStateCompleted, `{"parse_generation":2}`, `{}`, false},
		{"new publication", KindFinalizeLogParse, rivertype.JobStateCompleted, `{"parse_generation":2}`, `{"output":{"instances":[]}}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			latest := &rivertype.JobRow{ID: 3, Kind: tc.kind, State: tc.state, EncodedArgs: []byte(tc.args), Metadata: []byte(tc.metadata)}
			noOutput := &rivertype.JobRow{ID: 2, Kind: KindFinalizeLogParse, State: rivertype.JobStateCompleted, EncodedArgs: []byte(`{"parse_generation":2}`), Metadata: []byte(`{}`)}
			publication := &rivertype.JobRow{ID: 1, Kind: KindFinalizeLogParse, State: rivertype.JobStateCompleted, EncodedArgs: []byte(`{"parse_generation":2}`), Metadata: []byte(`{"output":{"instances":[{"id":"published-instance"}],"report":{"total_lines":5}}}`)}
			got := logGroupStatusJob([]*rivertype.JobRow{latest, noOutput, publication})
			if tc.wantPublication {
				require.Same(t, publication, got)
				require.Contains(t, string(got.Output()), "published-instance")
			} else {
				require.Same(t, latest, got)
			}
		})
	}
	require.Nil(t, logGroupStatusJob(nil))
}

func TestLogGroupStatusSelectsNewestPublicationInListOrder(t *testing.T) {
	t.Parallel()
	producer := &rivertype.JobRow{ID: 4, Kind: KindNativeLogParse, State: rivertype.JobStateCompleted, EncodedArgs: []byte(`{"parse_generation":2}`)}
	oldGeneration := &rivertype.JobRow{ID: 3, Kind: KindFinalizeLogParse, State: rivertype.JobStateCompleted, EncodedArgs: []byte(`{"parse_generation":1}`), Metadata: []byte(`{"output":{"instances":[]}}`)}
	newest := &rivertype.JobRow{ID: 2, Kind: KindFinalizeLogParse, State: rivertype.JobStateCompleted, EncodedArgs: []byte(`{"parse_generation":2}`), Metadata: []byte(`{"output":{"instances":[{"id":"newest"}]}}`)}
	older := &rivertype.JobRow{ID: 1, Kind: KindFinalizeLogParse, State: rivertype.JobStateCompleted, EncodedArgs: []byte(`{"parse_generation":2}`), Metadata: []byte(`{"output":{"instances":[{"id":"older"}]}}`)}
	require.Same(t, newest, logGroupStatusJob([]*rivertype.JobRow{producer, oldGeneration, newest, older}))
}
