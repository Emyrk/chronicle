package chronicle

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

type identityTestStore struct {
	database.Store
	revisionTestStore
}

func (s *identityTestStore) GetDatasetRevision(ctx context.Context, id uuid.UUID) (int64, error) {
	return s.revisionTestStore.GetDatasetRevision(ctx, id)
}
func (s *identityTestStore) LockDatasetRevision(ctx context.Context, id uuid.UUID) (int64, error) {
	return s.revisionTestStore.LockDatasetRevision(ctx, id)
}

func TestParseIdentityFreshDependencyPath(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	pool, err := pgxpool.New(ctx, "postgres://postgres@127.0.0.1:1/unused?sslmode=disable")
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	id := uuid.New()
	shared, err := gamedb.New(ctx, gamedb.Options{Pool: pool, DatasetID: id})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, shared.Close()) })
	c := &Chronicle{WoWDB: shared}
	fence := &parseIdentityFence{revision: datasetRevisionFence{datasetID: id, revision: 1}}
	first, closeFirst, err := c.acquireParseGameDB(ctx, id, fence)
	require.NoError(t, err)
	t.Cleanup(closeFirst)
	second, closeSecond, err := c.acquireParseGameDB(ctx, id, fence)
	require.NoError(t, err)
	t.Cleanup(closeSecond)
	require.NotSame(t, shared, first)
	require.NotSame(t, first, second)
	legacy, closeLegacy, err := c.acquireParseGameDB(ctx, id, nil)
	require.NoError(t, err)
	t.Cleanup(closeLegacy)
	require.Same(t, shared, legacy)
	_, _, err = c.acquireParseGameDB(ctx, uuid.New(), fence)
	require.ErrorIs(t, err, ErrParseIdentityChanged)
}

func TestParseIdentityAcceptance(t *testing.T) {
	t.Parallel()
	for _, mode := range []string{"same", "dataset", "revision", "default flavor", "additional flavor", "resolution error"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()
			ctx := t.Context()
			id := uuid.New()
			realm := uuid.New()
			expected := ResolvedDataset{DatasetID: id, Revision: 3, Flavor: database.WoWFlavor{database.FlavorVanilla}}
			current := expected
			var resolverErr error
			resolver := func(_ context.Context, _ database.Store, actualRealm uuid.UUID, lock bool) (ResolvedDataset, error) {
				require.Equal(t, realm, actualRealm)
				require.True(t, lock)
				return current, resolverErr
			}
			fence, flavor, err := newParseIdentityFence(expected, realm, database.LogFormat243CcAddon, nil, false, "sha256:"+strings.Repeat("a", 64), resolver)
			require.NoError(t, err)
			require.Equal(t, expected.Flavor, flavor) // Format does not infer expansion flavor.
			bound, ok := snapshot.FromContext(snapshot.WithCompatibility(ctx, fence.identity))
			require.True(t, ok)
			require.Equal(t, fence.identity, bound)
			switch mode {
			case "dataset":
				current.DatasetID = uuid.New()
			case "revision":
				current.Revision++
			case "default flavor":
				current.Flavor = database.WoWFlavor{database.FlavorTBC}
			case "additional flavor":
				current.AdditionalFlavor = database.WoWFlavor{database.FlavorTBC}
			case "resolution error":
				resolverErr = errors.New("unavailable")
			}
			store := &identityTestStore{revisionTestStore: revisionTestStore{revision: 3}}
			err = fence.check(ctx, store, true)
			if mode == "same" {
				require.NoError(t, err)
				require.True(t, store.locked)
			} else {
				require.ErrorIs(t, err, ErrParseIdentityChanged)
				require.False(t, store.locked)
			}
		})
	}
}

func TestParseIdentityExplicitFlavorStillChecksAdditionalFlavor(t *testing.T) {
	t.Parallel()
	expected := ResolvedDataset{DatasetID: uuid.New(), Revision: 1, Flavor: database.WoWFlavor{database.FlavorVanilla}}
	current := expected
	resolver := func(context.Context, database.Store, uuid.UUID, bool) (ResolvedDataset, error) { return current, nil }
	fence, _, err := newParseIdentityFence(expected, uuid.New(), database.LogFormat243CcAddon, database.WoWFlavor{database.FlavorTBC}, true, "sha256:"+strings.Repeat("b", 64), resolver)
	require.NoError(t, err)
	current.Flavor = database.WoWFlavor{database.FlavorTBC}
	store := &identityTestStore{revisionTestStore: revisionTestStore{revision: 1}}
	require.NoError(t, fence.check(t.Context(), store, true))
	current.AdditionalFlavor = database.WoWFlavor{database.FlavorVanilla}
	require.ErrorIs(t, fence.check(t.Context(), store, true), ErrParseIdentityChanged)
}

func TestParseIdentityLegacyPathDoesNotRequireBinding(t *testing.T) {
	t.Parallel()
	var fence *parseIdentityFence
	require.NoError(t, fence.check(t.Context(), nil, true))
}

// A bound parser session is constructed and advanced with read-only in-memory
// game data and no Chronicle, Store or authz dependency. Publication remains a
// worker responsibility, not a side effect of parsing or snapshot binding.
func TestParseIdentityBoundSessionNeedsNoPublicationDatabase(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat112aCcAddon, Flavor: flavor, DatasetID: id})
	ctx = snapshot.WithCompatibility(ctx, snapshot.Compatibility{DatasetID: id.String(), DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("c", 64), Format: string(database.LogFormat112aCcAddon), Flavor: flavor.CanonicalKey()})
	session, err := newVanillaFileSession(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), sessionGameDB{}, nil, false, "Test Realm")
	require.NoError(t, err)
	require.NoError(t, session.ProcessFile(ctx, strings.NewReader("0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05\n")))
}

func TestParseIdentityResolutionMismatchRollsBackPublication(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	initial := ResolvedDataset{DatasetID: uuid.New(), Revision: 1, Flavor: database.WoWFlavor{database.FlavorVanilla}}
	current := initial
	resolver := func(context.Context, database.Store, uuid.UUID, bool) (ResolvedDataset, error) { return current, nil }
	fence, _, err := newParseIdentityFence(initial, uuid.New(), database.LogFormat112aCcAddon, nil, false, "sha256:"+strings.Repeat("d", 64), resolver)
	require.NoError(t, err)
	current.AdditionalFlavor = database.WoWFlavor{database.FlavorTBC}
	id := uuid.New()
	err = db.InTx(ctx, func(tx database.Store) error {
		_, err := tx.InsertUser(ctx, database.InsertUserParams{ID: id, Username: id.String(), Email: id.String() + "@test.invalid"})
		if err != nil {
			return err
		}
		return fence.check(ctx, tx, true)
	}, nil)
	require.ErrorIs(t, err, ErrParseIdentityChanged)
	_, err = db.GetUserByID(ctx, id)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestParseIdentityRetryKeepsInferredFlavorOutOfInput(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, logID := parseGenerationFixture(t, ctx)
	c := &Chronicle{Zed: authz.NewDatabaseOnly(slog.New(slog.NewTextHandler(io.Discard, nil)), db)}
	first := ResolvedDataset{DatasetID: uuid.New(), Revision: 1, Flavor: database.WoWFlavor{database.FlavorVanilla}, AdditionalFlavor: database.WoWFlavor{database.FlavorTBC}}
	input, err := db.GetWoWLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Empty(t, input.WoWLogGroup.Flavor)
	effective, _ := resolveLogFlavor(database.FlavorFromStrings(input.WoWLogGroup.Flavor), len(input.WoWLogGroup.Flavor) > 0, first)
	require.NoError(t, c.persistAttemptFlavor(ctx, logID, 1, effective, &parseIdentityFence{}))
	// Simulate a failed parse and a real retry reading durable input again after
	// the default changed and tenant tags were removed. No origin was invented.
	retry, err := db.GetWoWLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Empty(t, retry.WoWLogGroup.Flavor)
	second := ResolvedDataset{DatasetID: first.DatasetID, Revision: 2, Flavor: database.WoWFlavor{database.FlavorWrath}}
	next, _ := resolveLogFlavor(database.FlavorFromStrings(retry.WoWLogGroup.Flavor), len(retry.WoWLogGroup.Flavor) > 0, second)
	require.Equal(t, database.WoWFlavor{database.FlavorWrath}, next)
	require.NoError(t, c.persistAttemptFlavor(ctx, logID, 1, effective, nil))
	legacy, err := db.GetWoWLogGroupByID(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, effective.Strings(), legacy.WoWLogGroup.Flavor)
}

type realmErrorStore struct {
	err           error
	fallbackCalls int
}

func (s *realmErrorStore) GetWoWServerRealmByName(context.Context, string) (database.WowServerRealm, error) {
	return database.WowServerRealm{}, s.err
}
func (s *realmErrorStore) GetWoWServerRealm(context.Context, uuid.UUID) (database.WowServerRealm, error) {
	s.fallbackCalls++
	return database.WowServerRealm{}, pgx.ErrNoRows
}
func TestParseIdentityRealmLookupFailsClosed(t *testing.T) {
	t.Parallel()
	failure := errors.New("database unavailable")
	db := &realmErrorStore{err: failure}
	_, err := lookupPreParseRealm(t.Context(), db, "late realm")
	require.ErrorIs(t, err, failure)
	_, err = resolveStrictPublicationRealm(t.Context(), db, "late realm", uuid.Nil)
	require.ErrorIs(t, err, failure)
	require.Zero(t, db.fallbackCalls)
	db.err = pgx.ErrNoRows
	realm, err := lookupPreParseRealm(t.Context(), db, "late realm")
	require.NoError(t, err)
	require.Equal(t, dbstatic.RealmUnknown(), realm.ID)
	_, err = resolveStrictPublicationRealm(t.Context(), db, "late realm", uuid.Nil)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.Equal(t, 1, db.fallbackCalls)
}
