package servicechronicle

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// resolveParseDataset never uses the service's pooled/fallback resolver. The
// caller's transaction holds realm -> server -> tenant -> dataset locks until
// commit, preventing both content mutation and dependency selection races.
func resolveParseDataset(ctx context.Context, db database.Store, realmID uuid.UUID, lock bool) (chronicle.ResolvedDataset, error) {
	return chronicle.ResolveNativeParseDataset(ctx, db, realmID, lock)
}
