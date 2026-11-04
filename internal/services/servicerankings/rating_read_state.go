package servicerankings

import (
	"context"
	"github.com/google/uuid"
)

// ratingEvolvingReader resolves the durable cutover state on every public read.
// A missing state row is resolved by SQL against the current active generation.
func ratingEvolvingReader(ctx context.Context, store interface{}, tenant uuid.UUID) (bool, error) {
	// Legacy test doubles predate the cutover query; the real database.Store
	// always implements it. Keep their published-generation fixtures intact.
	reader, ok := store.(interface {
		GetTenantRatingReadState(context.Context, uuid.UUID) (string, error)
	})
	if !ok {
		return false, nil
	}
	state, err := reader.GetTenantRatingReadState(ctx, tenant)
	return state == "evolving", err
}
