package chronicle

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// InsertParsedEventStreams writes only the event rows for an existing instance.
// It is a narrow primary-side adapter, not a complete parse-result ingest path.
// The caller must own the instance row and transaction. Events.Insert nils its
// own slice fields; convert to a fresh struct so the serializable input remains
// intact. Insert compresses the bytes but never writes into the input slices.
func InsertParsedEventStreams(ctx context.Context, store database.Store, instanceID uuid.UUID, streams parseresult.EventStreams) error {
	events := encounterevents.Events(streams)
	return events.Insert(ctx, store, instanceID)
}
