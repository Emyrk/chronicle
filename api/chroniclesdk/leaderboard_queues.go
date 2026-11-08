package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

type LeaderboardQueueDiagnostics struct {
	TenantID    uuid.UUID                `json:"tenant_id"`
	CollectedAt time.Time                `json:"collected_at"`
	Queues      []LeaderboardQueueStatus `json:"queues"`
}

type LeaderboardQueueStatus struct {
	Family          string     `json:"family"`
	Pending         int64      `json:"pending"`
	Due             int64      `json:"due"`
	Claimed         int64      `json:"claimed"`
	Retrying        int64      `json:"retrying"`
	OldestPendingAt *time.Time `json:"oldest_pending_at,omitempty"`
	OldestDueAt     *time.Time `json:"oldest_due_at,omitempty"`
}
