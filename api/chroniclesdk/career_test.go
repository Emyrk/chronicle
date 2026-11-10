package chroniclesdk

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCareerTransportNullAndZero(t *testing.T) {
	t.Parallel()
	zero := 0.0
	out := CareerPlayerResponse{Status: "ready", Cohorts: []CareerPlayerCohort{{PlayerClass: "PRIEST", PlayerSpec: "Holy", PlayerSubSpec: "Support", Summary: CareerSummary{Peak: &zero, Renown: 12, Contributions: []CareerContribution{}}}}, Issues: []CareerIssue{}}
	data, err := json.Marshal(out)
	require.NoError(t, err)
	require.Contains(t, string(data), `"mastery":null`)
	require.Contains(t, string(data), `"peak":0`)
	require.Contains(t, string(data), `"chosen_metric":null`)
	require.Contains(t, string(data), `"computed_at":null`)
	require.Contains(t, string(data), `"contributions":[]`)
	require.Contains(t, string(data), `"issues":[]`)
	empty, err := json.Marshal(CareerPlayerResponse{Cohorts: []CareerPlayerCohort{}, Issues: []CareerIssue{}})
	require.NoError(t, err)
	require.Contains(t, string(empty), `"cohorts":[]`)
}
