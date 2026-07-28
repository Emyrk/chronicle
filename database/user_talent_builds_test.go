package database_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestUserTalentBuilds(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	db, _ := dbtestutil.NewDB(t)

	newUser := func(t *testing.T, name string) uuid.UUID {
		t.Helper()
		id := uuid.New()
		_, err := db.InsertUser(ctx, database.InsertUserParams{
			ID:       id,
			Username: name,
			Email:    name + "@example.com",
		})
		require.NoError(t, err)
		return id
	}

	create := func(t *testing.T, userID uuid.UUID, name, build string) database.UserTalentBuild {
		t.Helper()
		row, err := db.CreateUserTalentBuild(ctx, database.CreateUserTalentBuildParams{
			UserID:  userID,
			Name:    name,
			ClassID: 1,
			Build:   build,
			Locked:  false,
		})
		require.NoError(t, err)
		return row
	}

	t.Run("CreateAndList", func(t *testing.T) {
		userID := newUser(t, "tb-create-list")
		first := create(t, userID, "Fury PvE", "30305-05")
		second := create(t, userID, "Prot MT", "5-3005301")

		builds, err := db.ListUserTalentBuilds(ctx, userID)
		require.NoError(t, err)
		require.Len(t, builds, 2)
		// Ordered by updated_at DESC — most recent first.
		require.Equal(t, second.ID, builds[0].ID)
		require.Equal(t, first.ID, builds[1].ID)

		count, err := db.CountUserTalentBuilds(ctx, userID)
		require.NoError(t, err)
		require.EqualValues(t, 2, count)
	})

	t.Run("NameUniquePerUserCaseInsensitive", func(t *testing.T) {
		userID := newUser(t, "tb-unique")
		otherID := newUser(t, "tb-unique-other")
		create(t, userID, "Fury PvE", "30305")

		_, err := db.CreateUserTalentBuild(ctx, database.CreateUserTalentBuildParams{
			UserID: userID, Name: "fury pve", ClassID: 1, Build: "",
		})
		require.True(t, database.IsUniqueViolation(err, database.UniqueUserTalentBuildsUserNameCiUidx))

		// Same name is fine for a different user.
		_, err = db.CreateUserTalentBuild(ctx, database.CreateUserTalentBuildParams{
			UserID: otherID, Name: "Fury PvE", ClassID: 1, Build: "",
		})
		require.NoError(t, err)
	})

	t.Run("UpdateOnlyOwn", func(t *testing.T) {
		userID := newUser(t, "tb-update")
		otherID := newUser(t, "tb-update-other")
		build := create(t, userID, "WIP", "303")

		// Partial update: only the build string.
		updated, err := db.UpdateUserTalentBuildByID(ctx, database.UpdateUserTalentBuildByIDParams{
			ID:     build.ID,
			UserID: userID,
			Build:  pgtype.Text{String: "30305-05", Valid: true},
			Locked: pgtype.Bool{Bool: true, Valid: true},
		})
		require.NoError(t, err)
		require.Equal(t, "WIP", updated.Name)
		require.Equal(t, "30305-05", updated.Build)
		require.True(t, updated.Locked)
		require.True(t, updated.UpdatedAt.Time.After(build.UpdatedAt.Time))

		// Another user cannot update it.
		_, err = db.UpdateUserTalentBuildByID(ctx, database.UpdateUserTalentBuildByIDParams{
			ID:     build.ID,
			UserID: otherID,
			Name:   pgtype.Text{String: "stolen", Valid: true},
		})
		require.ErrorIs(t, err, pgx.ErrNoRows)
	})

	t.Run("DeleteOnlyOwn", func(t *testing.T) {
		userID := newUser(t, "tb-delete")
		otherID := newUser(t, "tb-delete-other")
		build := create(t, userID, "To Delete", "")

		// Another user's delete is a no-op.
		deleted, err := db.DeleteUserTalentBuildByID(ctx, database.DeleteUserTalentBuildByIDParams{
			ID: build.ID, UserID: otherID,
		})
		require.NoError(t, err)
		require.EqualValues(t, 0, deleted)

		deleted, err = db.DeleteUserTalentBuildByID(ctx, database.DeleteUserTalentBuildByIDParams{
			ID: build.ID, UserID: userID,
		})
		require.NoError(t, err)
		require.EqualValues(t, 1, deleted)

		builds, err := db.ListUserTalentBuilds(ctx, userID)
		require.NoError(t, err)
		require.Empty(t, builds)
	})
}
