package servicerankings

import (
	"log/slog"
	"net/http"

	"github.com/Emyrk/chronicle/database"
)

// TestableService wraps handler logic for use in tests without requiring
// the full authz/SpiceDB stack.
type TestableService struct {
	store  database.Store
	logger *slog.Logger
}

// NewTestableService creates a minimal test-only service.
func NewTestableService(store database.Store, logger *slog.Logger) *TestableService {
	return &TestableService{store: store, logger: logger}
}

// HandleInstanceParses exposes the instance parses handler for tests.
func (ts *TestableService) HandleInstanceParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceParsesWithStore(ts.store, ts.logger, w, r)
}

// HandleListSnapshots exposes the list snapshots handler for tests.
func (ts *TestableService) HandleListSnapshots(w http.ResponseWriter, r *http.Request) {
	handleListSnapshotsWithStore(ts.store, w, r)
}

// HandleSnapshotCohort exposes the snapshot cohort debug handler for tests.
func (ts *TestableService) HandleSnapshotCohort(w http.ResponseWriter, r *http.Request) {
	handleSnapshotCohortWithStore(ts.store, w, r)
}

// HandleInstanceTimeParses exposes the instance time-parses handler for tests.
func (ts *TestableService) HandleInstanceTimeParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceTimeParsesWithStore(ts.store, ts.logger, w, r)
}

// HandleListTimeParseSnapshots exposes the time-parse snapshot list handler for tests.
func (ts *TestableService) HandleListTimeParseSnapshots(w http.ResponseWriter, r *http.Request) {
	handleListTimeParseSnapshotsWithStore(ts.store, w, r)
}

// HandleTimeParseCohortBuckets exposes the time-parse cohort buckets handler for tests.
func (ts *TestableService) HandleTimeParseCohortBuckets(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortBucketsWithStore(ts.store, w, r)
}

// HandleTimeParseCohort exposes the time-parse cohort handler for tests.
func (ts *TestableService) HandleTimeParseCohort(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortWithStore(ts.store, w, r)
}
