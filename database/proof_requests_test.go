package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestProofRequestLifecycle(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "proof-" + userID.String()[:8]})
	require.NoError(t, err)
	id := uuid.New()
	created, err := db.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: id, ApplicantID: userID, Purpose: "character-link", EvidenceKey: id.String() + ".jpg", Message: "Please review"})
	require.NoError(t, err)
	require.Equal(t, "pending", created.Status)
	own, err := db.ListMyProofRequests(ctx, userID)
	require.NoError(t, err)
	require.Len(t, own, 1)
	n, err := db.DecideProofRequest(ctx, database.DecideProofRequestParams{ID: id, Status: "rejected", Response: "Not enough evidence", ReviewerID: uuid.NullUUID{UUID: userID, Valid: true}})
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	n, err = db.DecideProofRequest(ctx, database.DecideProofRequestParams{ID: id, Status: "approved", ReviewerID: uuid.NullUUID{UUID: userID, Valid: true}})
	require.NoError(t, err)
	require.Zero(t, n)
	cleanup, err := db.ListProofEvidenceCleanup(ctx)
	require.NoError(t, err)
	require.Len(t, cleanup, 1)
	require.Equal(t, id, cleanup[0].ID)
	require.NoError(t, db.CompleteProofEvidenceCleanup(ctx, id))
	final, err := db.GetProofRequest(ctx, id)
	require.NoError(t, err)
	require.Equal(t, "rejected", final.Status)
	require.Empty(t, final.EvidenceKey)
	require.False(t, final.EvidenceDeletePending)
}

func TestProofPendingCharacterIsExclusive(t *testing.T) {
	t.Parallel()
	_, db, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "proof-" + userID.String()[:8]})
	require.NoError(t, err)
	character := guid.GUID(12345)
	ids := []uuid.UUID{uuid.New(), uuid.New()}
	for _, id := range ids {
		_, err := db.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: id, ApplicantID: userID, Purpose: "character-link", EvidenceKey: id.String() + ".jpg"})
		require.NoError(t, err)
	}
	insert := func(id uuid.UUID) error {
		return db.InsertProofCharacterSubject(ctx, database.InsertProofCharacterSubjectParams{RequestID: id, RealmID: uuid.NullUUID{UUID: realmID, Valid: true}, CharacterGuid: &character, Name: "Tester", RealmName: "test-realm"})
	}
	require.NoError(t, insert(ids[0]))
	require.True(t, database.IsUniqueViolation(insert(ids[1])))
	subjects, err := db.ListProofSubjects(ctx, ids[0])
	require.NoError(t, err)
	require.Len(t, subjects, 1)
	n, err := db.DecideProofSubject(ctx, database.DecideProofSubjectParams{ID: subjects[0].ID, Status: "rejected"})
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	require.NoError(t, insert(ids[1]))
}
