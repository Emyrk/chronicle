package spice

import (
	"context"
	"errors"

	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
)

type spiceActorKey struct{}

var NoActorError = errors.New("no authorization actor in context")

func ActorFromContext(ctx context.Context) (*v1.SubjectReference, bool) {
	a, ok := ctx.Value(spiceActorKey{}).(*v1.SubjectReference)
	return a, ok
}

func AsUser(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, spiceActorKey{}, &v1.SubjectReference{
		Object: policy.New().User(userID).Object(),
	})
}
