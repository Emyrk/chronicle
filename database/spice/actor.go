package spice

import (
	"context"
	"errors"

	"github.com/Emyrk/chronicle/database/spice/policy"
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/google/uuid"
)

const (
	god = "god"
)

type spiceActorKey struct{}

var NoActorError = errors.New("no authorization actor in context")

func ActorFromContext(ctx context.Context) (*v1.SubjectReference, bool) {
	a, ok := ctx.Value(spiceActorKey{}).(*v1.SubjectReference)
	return a, ok
}

// AsGod is a hack to get around bootstrapping. Since we need perms to create the
// first users. Idk if we should keep this.
func AsGod(ctx context.Context) context.Context {
	return context.WithValue(ctx, spiceActorKey{}, &v1.SubjectReference{
		Object: &v1.ObjectReference{
			ObjectType: god,
			ObjectId:   god,
		},
	})
}

func AsUser(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, spiceActorKey{}, &v1.SubjectReference{
		Object: policy.New().User(userID).Object(),
	})
}
