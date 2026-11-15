package chronicle

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type publicationSignalStore struct {
	database.Store
	read func(context.Context, uuid.UUID) (database.ParserHandoff, error)
}

func (s publicationSignalStore) GetParserHandoff(ctx context.Context, id uuid.UUID) (database.ParserHandoff, error) {
	return s.read(ctx, id)
}

func TestNativePublicationPendingAccessor(t *testing.T) {
	t.Parallel()
	failure := errors.New("storage unavailable")
	for _, tc := range []struct {
		name string
		err  error
	}{
		{name: "absent legacy handoff", err: pgx.ErrNoRows},
		{name: "disabled native handoff"},
		{name: "database failure", err: failure},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitShort)
			id := uuid.New()
			store := publicationSignalStore{read: func(got context.Context, gotID uuid.UUID) (database.ParserHandoff, error) {
				require.Equal(t, ctx, got, "must retain the authorized request's tenant context")
				require.Equal(t, id, gotID)
				return database.ParserHandoff{}, tc.err
			}}
			c := &Chronicle{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)}
			pending, err := c.NativePublicationPending(ctx, id)
			if errors.Is(tc.err, failure) {
				require.ErrorIs(t, err, failure)
			} else {
				require.NoError(t, err)
			}
			require.False(t, pending)
			// No queue or private-group implementation is provided: neither should be used.
		})
	}
}
