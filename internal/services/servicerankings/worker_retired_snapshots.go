package servicerankings

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const (
	KindRetiredPublishParseSnapshots      = "publish-parse-snapshots"
	KindRetiredPublishParseSnapshotTenant = "publish-parse-snapshot-tenant"
)

// ArgsRetiredPublishParseSnapshots keeps the retired dispatch kind registered
// until jobs queued by older deployments have drained.
type ArgsRetiredPublishParseSnapshots struct{}

func (ArgsRetiredPublishParseSnapshots) Kind() string {
	return KindRetiredPublishParseSnapshots
}

// ArgsRetiredPublishParseSnapshotTenant preserves the old JSON shape so River
// can decode tenant publication jobs queued before snapshot removal.
type ArgsRetiredPublishParseSnapshotTenant struct {
	TenantID      uuid.UUID `json:"tenant_id"`
	Cutoff        time.Time `json:"cutoff"`
	LookbackDays  int32     `json:"lookback_days"`
	PolicyVersion int16     `json:"policy_version"`
	AdminBackfill bool      `json:"admin_backfill,omitempty"`
}

func (ArgsRetiredPublishParseSnapshotTenant) Kind() string {
	return KindRetiredPublishParseSnapshotTenant
}

// WorkerRetiredPublishParseSnapshots drains retired dispatch jobs without
// accessing snapshot tables or enqueueing replacement work.
type WorkerRetiredPublishParseSnapshots struct {
	river.WorkerDefaults[ArgsRetiredPublishParseSnapshots]
}

func (*WorkerRetiredPublishParseSnapshots) Work(context.Context, *river.Job[ArgsRetiredPublishParseSnapshots]) error {
	return nil
}

// WorkerRetiredPublishParseSnapshotTenant drains retired tenant jobs without
// accessing snapshot tables.
type WorkerRetiredPublishParseSnapshotTenant struct {
	river.WorkerDefaults[ArgsRetiredPublishParseSnapshotTenant]
}

func (*WorkerRetiredPublishParseSnapshotTenant) Work(context.Context, *river.Job[ArgsRetiredPublishParseSnapshotTenant]) error {
	return nil
}
