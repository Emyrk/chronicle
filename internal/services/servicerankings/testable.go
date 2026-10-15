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

// TestableParsesService exposes only the instance parses handler and accepts its
// narrow query interface so tests can assert that retired fallback queries are not used.
type TestableParsesService struct {
	store  parsesQuerier
	logger *slog.Logger
}

func NewTestableParsesService(store parsesQuerier, logger *slog.Logger) *TestableParsesService {
	return &TestableParsesService{store: store, logger: logger}
}

func (ts *TestableParsesService) HandleInstanceParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceParsesWithStore(ts.store, ts.logger, w, r)
}

// HandleInstanceParses exposes the instance parses handler for tests.
func (ts *TestableService) HandleInstanceParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceParsesWithStore(ts.store, ts.logger, w, r)
}

// HandleInstanceTimeParses exposes the instance time-parses handler for tests.
func (ts *TestableService) HandleInstanceTimeParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceTimeParsesWithStore(ts.store, w, r)
}

// HandleParseScoreCohortBuckets exposes the live DPS/HPS cohort bucket handler for tests.
func (ts *TestableService) HandleParseScoreCohortBuckets(w http.ResponseWriter, r *http.Request) {
	handleParseScoreCohortBucketsWithStore(ts.store, w, r)
}

// HandleParseScoreCohort exposes the live DPS/HPS cohort handler for tests.
func (ts *TestableService) HandleParseScoreCohort(w http.ResponseWriter, r *http.Request) {
	handleParseScoreCohortWithStore(ts.store, w, r)
}

// HandleTimeParseCohortBuckets exposes the time-parse cohort buckets handler for tests.
func (ts *TestableService) HandleTimeParseCohortBuckets(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortBucketsWithStore(ts.store, w, r)
}

// HandleTimeParseCohort exposes the time-parse cohort handler for tests.
func (ts *TestableService) HandleTimeParseCohort(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortWithStore(ts.store, w, r)
}
