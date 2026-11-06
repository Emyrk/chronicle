package servicerankings_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestRetiredSnapshotWorkers(t *testing.T) {
	t.Parallel()

	t.Run("Dispatch", func(t *testing.T) {
		t.Parallel()
		var args servicerankings.ArgsRetiredPublishParseSnapshots
		require.NoError(t, json.Unmarshal([]byte(`{}`), &args))
		require.Equal(t, "publish-parse-snapshots", args.Kind())
		require.NoError(t, (&servicerankings.WorkerRetiredPublishParseSnapshots{}).Work(
			context.Background(),
			&river.Job[servicerankings.ArgsRetiredPublishParseSnapshots]{Args: args},
		))
	})

	t.Run("Tenant", func(t *testing.T) {
		t.Parallel()
		const payload = `{
			"tenant_id":"114e71fe-a88f-45fb-8360-2866d49e13b1",
			"cutoff":"2026-10-14T00:00:00Z",
			"lookback_days":60,
			"policy_version":4,
			"admin_backfill":true
		}`
		var args servicerankings.ArgsRetiredPublishParseSnapshotTenant
		require.NoError(t, json.Unmarshal([]byte(payload), &args))
		require.Equal(t, "publish-parse-snapshot-tenant", args.Kind())
		require.Equal(t, uuid.MustParse("114e71fe-a88f-45fb-8360-2866d49e13b1"), args.TenantID)
		require.Equal(t, time.Date(2026, time.October, 14, 0, 0, 0, 0, time.UTC), args.Cutoff)
		require.Equal(t, int32(60), args.LookbackDays)
		require.Equal(t, int16(4), args.PolicyVersion)
		require.True(t, args.AdminBackfill)
		require.NoError(t, (&servicerankings.WorkerRetiredPublishParseSnapshotTenant{}).Work(
			context.Background(),
			&river.Job[servicerankings.ArgsRetiredPublishParseSnapshotTenant]{Args: args},
		))
	})
}
