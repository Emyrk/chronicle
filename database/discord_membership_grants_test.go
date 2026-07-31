package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestDiscordMembershipGrantChecks(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "discord-grant-" + uuid.NewString()[:8],
		Email:    uuid.NewString() + "@example.com",
	})
	require.NoError(t, err)

	grants, err := db.GetUserDataGrants(ctx, userID)
	require.NoError(t, err)
	require.Len(t, grants, 1)
	require.Equal(t, "base", grants[0].Source)
	require.Equal(t, int64(150_000_000), grants[0].StorageBytes)

	_, err = db.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID:       uuid.New(),
		LinkedID: uuid.NewString(),
		UserID:   userID,
		Provider: "discord",
	})
	require.NoError(t, err)

	now := time.Now().UTC().Round(time.Microsecond)
	_, err = db.InsertDiscordMembershipGrantCheck(ctx, database.InsertDiscordMembershipGrantCheckParams{
		UserID:      userID,
		NextCheckAt: database.Timestamptz(now.Add(-time.Hour)),
	})
	require.NoError(t, err)

	claims, err := db.ClaimDueDiscordMembershipGrantChecks(ctx, database.ClaimDueDiscordMembershipGrantChecksParams{
		CheckTime:  database.Timestamptz(now),
		LimitCount: 100,
	})
	require.NoError(t, err)
	require.Len(t, claims, 1)
	require.True(t, claims[0].ClaimToken.Valid)

	_, err = db.CompleteDiscordMembershipGrantCheckError(ctx, database.CompleteDiscordMembershipGrantCheckErrorParams{
		CheckedAt:  database.Timestamptz(now),
		LastError:  pgtype.Text{String: "discord unavailable", Valid: true},
		UserID:     userID,
		ClaimToken: claims[0].ClaimToken,
	})
	require.NoError(t, err)

	claims, err = db.ClaimDueDiscordMembershipGrantChecks(ctx, database.ClaimDueDiscordMembershipGrantChecksParams{
		CheckTime:  database.Timestamptz(now.Add(30 * 24 * time.Hour)),
		LimitCount: 100,
	})
	require.NoError(t, err)
	require.Empty(t, claims)

	loginClaim, err := db.ActivateDiscordMembershipGrantCheckOnLogin(ctx, database.ActivateDiscordMembershipGrantCheckOnLoginParams{
		UserID:    userID,
		CheckTime: database.Timestamptz(now.Add(time.Hour)),
	})
	require.NoError(t, err)
	require.True(t, loginClaim.ClaimToken.Valid)

	checkedAt := now.Add(2 * time.Hour)
	err = db.InTx(ctx, func(tx database.Store) error {
		_, err := tx.CompleteDiscordMembershipGrantCheckMember(ctx, database.CompleteDiscordMembershipGrantCheckMemberParams{
			CheckedAt:  database.Timestamptz(checkedAt),
			UserID:     userID,
			ClaimToken: loginClaim.ClaimToken,
		})
		if err != nil {
			return err
		}
		_, err = tx.UpsertDataGrant(ctx, storagegrants.DiscordMemberStorageGrant(userID, checkedAt))
		return err
	}, nil)
	require.NoError(t, err)

	grants, err = db.GetUserDataGrants(ctx, userID)
	require.NoError(t, err)
	require.Len(t, grants, 2)

	user, err := db.GetUserByID(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, int64(225_000_000), user.MaxStorageBytes)
}
