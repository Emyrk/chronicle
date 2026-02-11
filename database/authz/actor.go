package authz

import (
	"context"
	"errors"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/google/uuid"
)

type authzActorKey struct{}

var NoActorError = errors.New("no authorization actor in context")

func ActorFromContext(ctx context.Context) (*policy.ObjUser, bool) {
	a, ok := ctx.Value(authzActorKey{}).(*policy.ObjUser)
	return a, ok
}

func AsUser(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, authzActorKey{}, policy.New().User(userID))
}
