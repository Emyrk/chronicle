package cosmetics

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type fakeAuthorizer struct {
	allowed []string
	err     error
}

func (f fakeAuthorizer) ListAllowedCosmetics(context.Context, uuid.UUID) ([]string, error) {
	return f.allowed, f.err
}

type fakeStore struct {
	records []database.UserCharacterCosmetic
	users   []uuid.UUID
	updates []database.UpdateUserCharacterActiveCosmeticsParams
}

func (f *fakeStore) GetUserCharacterCosmetics(context.Context, uuid.UUID) ([]database.UserCharacterCosmetic, error) {
	return f.records, nil
}

func (f *fakeStore) UpdateUserCharacterActiveCosmetics(_ context.Context, arg database.UpdateUserCharacterActiveCosmeticsParams) (database.UserCharacterCosmetic, error) {
	f.updates = append(f.updates, arg)
	return database.UserCharacterCosmetic{}, nil
}

func (f *fakeStore) ListUsersWithCharacterCosmetics(context.Context) ([]uuid.UUID, error) {
	return f.users, nil
}

type fakeInserter struct {
	users []uuid.UUID
}

func (f *fakeInserter) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	f.users = append(f.users, args.(ArgsAuditUser).UserID)
	return &rivertype.JobInsertResult{}, nil
}

func TestActiveSelection(t *testing.T) {
	t.Parallel()

	requested := Selection{NameID: "name_holy", BackgroundID: "background_starfall", BorderID: "name_rare"}
	active := ActiveSelection(requested, []string{"name_holy", "background_starfall", "name_rare"})
	require.Equal(t, "name_holy", active.NameID)
	require.Equal(t, "background_starfall", active.BackgroundID)
	require.Empty(t, active.BorderID, "wrong-slot cosmetics must never become active")
}

func TestWorkerAuditUser(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	linkID := uuid.New()
	store := &fakeStore{records: []database.UserCharacterCosmetic{{
		UserCharacterLinkID:   linkID,
		RequestedNameID:       "name_holy",
		RequestedBackgroundID: "background_starfall",
		RequestedBorderID:     "border_elite",
		ActiveNameID:          "name_holy",
		ActiveBackgroundID:    "background_starfall",
		ActiveBorderID:        "border_elite",
	}}}
	worker := &WorkerAuditUser{
		Store: store,
		Authz: fakeAuthorizer{allowed: []string{"name_holy"}},
	}
	err := worker.Work(context.Background(), &river.Job[ArgsAuditUser]{Args: ArgsAuditUser{UserID: userID}})
	require.NoError(t, err)
	require.Equal(t, []database.UpdateUserCharacterActiveCosmeticsParams{{
		UserID: userID, UserCharacterLinkID: linkID, ActiveNameID: "name_holy",
	}}, store.updates)
}

func TestWorkerAuditUserIsIdempotent(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	store := &fakeStore{records: []database.UserCharacterCosmetic{{
		UserCharacterLinkID: uuid.New(),
		RequestedNameID:     "name_holy",
		ActiveNameID:        "name_holy",
	}}}
	worker := &WorkerAuditUser{Store: store, Authz: fakeAuthorizer{allowed: []string{"name_holy"}}}
	require.NoError(t, worker.Work(context.Background(), &river.Job[ArgsAuditUser]{Args: ArgsAuditUser{UserID: userID}}))
	require.Empty(t, store.updates)
}

func TestWorkerDispatchAudits(t *testing.T) {
	t.Parallel()

	users := []uuid.UUID{uuid.New(), uuid.New()}
	store := &fakeStore{users: users}
	queue := &fakeInserter{}
	worker := &WorkerDispatchAudits{Store: store, Queue: queue}
	require.NoError(t, worker.Work(context.Background(), &river.Job[ArgsDispatchAudits]{}))
	require.Equal(t, users, queue.users)
}

func TestAuditJobIsUniqueByUser(t *testing.T) {
	t.Parallel()

	opts := (ArgsAuditUser{UserID: uuid.New()}).InsertOpts()
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRunning)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
}
