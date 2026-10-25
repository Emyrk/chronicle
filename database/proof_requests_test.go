package database_test

import (
	"database/sql"
	"testing"
	"time"

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
	tenantID := uuid.New()
	created, err := db.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: id, TenantID: tenantID, ApplicantID: userID, Purpose: "character-link", EvidenceKey: id.String() + ".jpg", Message: "Please review"})
	require.NoError(t, err)
	require.Equal(t, "pending", created.Status)
	own, err := db.ListMyProofRequests(ctx, database.ListMyProofRequestsParams{ApplicantID: userID, TenantID: tenantID})
	require.NoError(t, err)
	require.Len(t, own, 1)
	other, err := db.ListMyProofRequests(ctx, database.ListMyProofRequestsParams{ApplicantID: userID, TenantID: uuid.New()})
	require.NoError(t, err)
	require.Empty(t, other)
	_, err = db.GetTenantProofRequest(ctx, database.GetTenantProofRequestParams{ID: id, TenantID: uuid.New()})
	require.ErrorIs(t, err, sql.ErrNoRows)
	otherID := uuid.New()
	otherTenant := uuid.New()
	_, err = db.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: otherID, TenantID: otherTenant, ApplicantID: userID, Purpose: "character-link", EvidenceKey: otherID.String() + ".jpg"})
	require.NoError(t, err)
	mine, err := db.ListMyProofRequests(ctx, database.ListMyProofRequestsParams{ApplicantID: userID, TenantID: tenantID})
	require.NoError(t, err)
	require.Len(t, mine, 1)
	review, err := db.ListAdminProofRequests(ctx, tenantID)
	require.NoError(t, err)
	require.Len(t, review, 1)
	_, err = db.LockPendingProofRequest(ctx, database.LockPendingProofRequestParams{ID: otherID, TenantID: tenantID})
	require.ErrorIs(t, err, sql.ErrNoRows)
	all, err := db.ListAllProofRequests(ctx)
	require.NoError(t, err)
	require.Len(t, all, 2)
	n, err := db.DecideProofRequest(ctx, database.DecideProofRequestParams{ID: id, Status: "rejected", Response: "Not enough evidence", ReviewerID: uuid.NullUUID{UUID: userID, Valid: true}})
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	n, err = db.DecideProofRequest(ctx, database.DecideProofRequestParams{ID: id, Status: "approved", ReviewerID: uuid.NullUUID{UUID: userID, Valid: true}})
	require.NoError(t, err)
	require.Zero(t, n)
	cleanup, err := db.ListProofEvidenceCleanup(ctx, tenantID)
	require.NoError(t, err)
	require.Len(t, cleanup, 1)
	require.Equal(t, id, cleanup[0].ID)
	require.NoError(t, db.CompleteProofEvidenceCleanup(ctx, database.CompleteProofEvidenceCleanupParams{ID: id, TenantID: tenantID}))
	final, err := db.GetProofRequest(ctx, id)
	require.NoError(t, err)
	require.Equal(t, "rejected", final.Status)
	require.Empty(t, final.EvidenceKey)
	require.False(t, final.EvidenceDeletePending)
}

func TestProofPendingCharacterIsExclusive(t *testing.T) {
	t.Parallel()
	pool, db, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "proof-" + userID.String()[:8]})
	require.NoError(t, err)
	character := guid.GUID(12345)
	ids := []uuid.UUID{uuid.New(), uuid.New()}
	for _, id := range ids {
		_, err := db.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: id, TenantID: uuid.New(), ApplicantID: userID, Purpose: "character-link", EvidenceKey: id.String() + ".jpg"})
		require.NoError(t, err)
	}
	insert := func(id uuid.UUID) error {
		return db.InsertProofSubject(ctx, database.InsertProofSubjectParams{RequestID: id, SubjectType: "character", RealmID: uuid.NullUUID{UUID: realmID, Valid: true}, CharacterGuid: &character, Name: "Tester", RealmName: "test-realm"})
	}
	// The class query joins armory data for both old and new requests,
	// without another lookup for every subject in a review.
	guildID := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", guildID, realmID, "Proof Guild")
	require.NoError(t, err)
	players := db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{
		ID: character, RealmID: realmID, Name: "Tester", GuildID: uuid.NullUUID{UUID: guildID, Valid: true},
		Class: database.WowPlayableClassWARRIOR, Gender: database.WowPlayableGenderMale,
		Race: database.WowPlayableRaceHuman, Level: 60,
		UpdatedAt: database.Timestamptz(time.Now()),
	}})
	require.NoError(t, players.Close())
	require.NoError(t, insert(ids[0]))
	classes, err := db.ListProofSubjectClasses(ctx, ids[0])
	require.NoError(t, err)
	require.Len(t, classes, 1)
	require.Equal(t, database.WowPlayableClassWARRIOR, classes[0].Class)
	require.Equal(t, "Proof Guild", classes[0].GuildName.String)
	otherClasses, err := db.ListProofSubjectClasses(ctx, ids[1])
	require.NoError(t, err)
	require.Empty(t, otherClasses)
	require.True(t, database.IsUniqueViolation(insert(ids[1])))
	subjects, err := db.ListProofSubjects(ctx, ids[0])
	require.NoError(t, err)
	require.Len(t, subjects, 1)
	n, err := db.DecideProofSubject(ctx, database.DecideProofSubjectParams{ID: subjects[0].ID, Status: "rejected"})
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	require.NoError(t, insert(ids[1]))
}
