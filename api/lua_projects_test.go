package api

import (
	"errors"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestLuaProjectOwnerAndPublication(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t)
	owner, other := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{owner, other} {
		_, err := db.InsertUser(ctx, database.InsertUserParams{ID: id, Username: "u" + id.String(), Email: id.String() + "@example.org"})
		require.NoError(t, err)
	}
	project, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Example", Slug: "example"})
	require.NoError(t, err)
	_, err = db.GetOwnerLuaProject(ctx, database.GetOwnerLuaProjectParams{ID: project.ID, OwnerID: other})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.GetPublicLuaProject(ctx, project.ID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: other, Hash: pgtype.Text{String: "draft", Valid: true}, ExpectedRevision: 1})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: "draft", Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: "stale", Valid: true}, ExpectedRevision: 1})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	unstable, err := db.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	require.Equal(t, "draft", unstable.UnstableHash.String)
	_, err = db.PromoteLuaProjectStable(ctx, database.PromoteLuaProjectStableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: other, Valid: true}, ExpectedRevision: 3, TestedSha256: pgtype.Text{String: "draft", Valid: true}})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.PromoteLuaProjectStable(ctx, database.PromoteLuaProjectStableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 3, TestedSha256: pgtype.Text{String: "untested", Valid: true}})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	stable, err := db.PromoteLuaProjectStable(ctx, database.PromoteLuaProjectStableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 3, TestedSha256: pgtype.Text{String: "draft", Valid: true}})
	require.NoError(t, err)
	require.Equal(t, unstable.UnstableHash, stable.StableHash)
	visible, err := db.GetPublicLuaProject(ctx, project.ID)
	require.NoError(t, err)
	require.Equal(t, stable.StableHash, visible.StableHash)
	// The install and preview reads must never expose another owner's draft.
	draft, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Preview", Slug: "preview"})
	require.NoError(t, err)
	packageHash := strings.Repeat("a", 64)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: draft.ID, OwnerID: owner, Hash: pgtype.Text{String: packageHash, Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	require.NoError(t, db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash, Bytes: []byte("zip")}))
	_, err = db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: other})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	preview, err := db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: owner})
	require.NoError(t, err)
	require.Equal(t, []byte("zip"), preview.Bytes)
	_, err = db.GetPublishedLuaProjectPackage(ctx, database.GetPublishedLuaProjectPackageParams{ID: draft.ID, Channel: "stable"})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	guide, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "guide", Name: "Future", Slug: "future"})
	require.NoError(t, err)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: guide.ID, OwnerID: owner, Hash: pgtype.Text{String: "draft", Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = db.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: guide.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 2})
	require.True(t, errors.Is(err, pgx.ErrNoRows))
}
