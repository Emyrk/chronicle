package serviceoauth

import (
	"context"

	"github.com/google/uuid"
)

type pendingSidekickMetadataContextKey struct{}

func withPendingSidekickMetadata(ctx context.Context, metadata sidekickMetadata) context.Context {
	return context.WithValue(ctx, pendingSidekickMetadataContextKey{}, metadata)
}

func pendingSidekickMetadata(ctx context.Context) (sidekickMetadata, bool) {
	metadata, ok := ctx.Value(pendingSidekickMetadataContextKey{}).(sidekickMetadata)
	return metadata, ok && metadata.ID != uuid.Nil
}

type sidekickInstallationContextKey struct{}

func withSidekickInstallationID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, sidekickInstallationContextKey{}, id)
}

func SidekickInstallationID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(sidekickInstallationContextKey{}).(uuid.UUID)
	return id, ok && id != uuid.Nil
}

type oauthBearerContextKey struct{}

func withOAuthBearer(ctx context.Context) context.Context {
	return context.WithValue(ctx, oauthBearerContextKey{}, true)
}

// OAuthBearer reports whether the request authenticated with an OAuth access
// token rather than a Chronicle session.
func OAuthBearer(ctx context.Context) bool {
	ok, _ := ctx.Value(oauthBearerContextKey{}).(bool)
	return ok
}
