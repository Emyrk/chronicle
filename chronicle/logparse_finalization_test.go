package chronicle

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestRecordInstanceFinalization(t *testing.T) {
	t.Parallel()
	failure := errors.New("finalize failed")
	for _, tc := range []struct {
		name   string
		result *instances.FinalizedInstance
		err    error
	}{
		{name: "nil_result_error", err: failure},
		{name: "empty_result_error", result: &instances.FinalizedInstance{}, err: failure},
		{name: "nil_result_success"},
		{name: "empty_result_success", result: &instances.FinalizedInstance{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			reg := prometheus.NewRegistry()
			metrics := newLogParseMetrics(reg)
			output := chroniclesdk.WoWParsedLogJobOutput{InstanceFailures: make(map[string]string)}
			report := &chroniclesdk.LogParseReport{}
			got, proceed := recordInstanceFinalization(tc.result, tc.err, 3, "raid", 1250*time.Millisecond, 2750*time.Millisecond, &output, report, metrics)
			require.False(t, proceed)
			if tc.err == nil {
				require.Empty(t, output.InstanceFailures)
				require.Empty(t, report.Instances)
				require.Equal(t, float64(0), prometheusCounterValue(t, metrics.instanceFailures))
				families, err := reg.Gather()
				require.NoError(t, err)
				require.NotContains(t, metricFamilyNames(families), "chronicle_logparse_instance_duration_seconds")
				return
			}
			require.Equal(t, map[string]string{"raid_3": "finalize failed"}, output.InstanceFailures)
			require.Equal(t, []chroniclesdk.InstanceReport{{Name: "raid", ParseDuration: 1250, FinalizeDuration: 2750}}, report.Instances)
			require.Equal(t, report.Instances[0], got)
			require.Equal(t, float64(1), prometheusCounterValue(t, metrics.instanceFailures))
			families, err := reg.Gather()
			require.NoError(t, err)
			for _, family := range families {
				if family.GetName() == "chronicle_logparse_instance_duration_seconds" {
					require.Len(t, family.Metric, 2)
					for _, metric := range family.Metric {
						require.Equal(t, uint64(1), metric.GetHistogram().GetSampleCount())
					}
				}
			}
			require.Contains(t, metricFamilyNames(families), "chronicle_logparse_instance_duration_seconds")
		})
	}
}
