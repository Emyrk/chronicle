package servicedataset

import (
	"context"

	"github.com/google/uuid"
)

type datasetCtxKey struct{}

// WithDatasetID injects the resolved dataset ID into the context.
func WithDatasetID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, datasetCtxKey{}, id)
}

// DatasetIDFromContext returns the dataset UUID from context, or uuid.Nil if unset.
func DatasetIDFromContext(ctx context.Context) uuid.UUID {
	v, ok := ctx.Value(datasetCtxKey{}).(uuid.UUID)
	if !ok {
		return uuid.Nil
	}
	return v
}
