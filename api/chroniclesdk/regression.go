package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type RegressionFixture struct {
	ID         uuid.UUID `json:"id"`
	LogGroupID uuid.UUID `json:"log_group_id"`
	Note       string    `json:"note"`
	CreatedAt  time.Time `json:"created_at"`
}

type RegressionSnapshotSummary struct {
	ID        uuid.UUID `json:"id"`
	FixtureID uuid.UUID `json:"fixture_id"`
	Version   string    `json:"version"`
	BuildTime string    `json:"build_time"`
	CreatedAt time.Time `json:"created_at"`
}

type RegressionSnapshotFull struct {
	RegressionSnapshotSummary
	Snapshot json.RawMessage `json:"snapshot"`
}

type CreateRegressionFixtureRequest struct {
	LogGroupID uuid.UUID `json:"log_group_id"`
	Note       string    `json:"note"`
}

type UpdateRegressionFixtureNoteRequest struct {
	Note string `json:"note"`
}

type RequeueVersionRequest struct {
	Version string `json:"version"`
}

type RequeueVersionResponse struct {
	RequeuedCount int `json:"requeued_count"`
}
