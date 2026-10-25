package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
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
	owner, other, technicalAdmin := uuid.New(), uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{owner, other, technicalAdmin} {
		_, err := db.InsertUser(ctx, database.InsertUserParams{ID: id, Username: "u" + id.String(), Email: id.String() + "@example.org"})
		require.NoError(t, err)
	}
	project, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Example", Slug: "example"})
	require.NoError(t, err)
	_, err = db.GetOwnerLuaProject(ctx, database.GetOwnerLuaProjectParams{ID: project.ID, OwnerID: other})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	adminProject, err := db.GetOwnerLuaProject(ctx, database.GetOwnerLuaProjectParams{ID: project.ID, OwnerID: technicalAdmin, TechnicalAdmin: true})
	require.NoError(t, err)
	require.Equal(t, project.ID, adminProject.ID)
	_, err = db.GetOwnerLuaProject(ctx, database.GetOwnerLuaProjectParams{ID: project.ID, OwnerID: technicalAdmin})
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
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: technicalAdmin, Hash: pgtype.Text{String: "admin-draft", Valid: true}, ExpectedRevision: 4})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	adminEdited, err := db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: technicalAdmin, TechnicalAdmin: true, Hash: pgtype.Text{String: "admin-draft", Valid: true}, ExpectedRevision: 4})
	require.NoError(t, err)
	require.Equal(t, owner, adminEdited.OwnerID, "admin update must not transfer ownership")
	_, err = db.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: technicalAdmin, Valid: true}, ExpectedRevision: 5})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	adminPublished, err := db.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: technicalAdmin, Valid: true}, TechnicalAdmin: true, ExpectedRevision: 5})
	require.NoError(t, err)
	require.Equal(t, technicalAdmin, adminPublished.UnstablePublishedBy.UUID)
	// The install and preview reads must never expose another owner's draft.
	draft, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Preview", Slug: "preview"})
	require.NoError(t, err)
	packageHash := strings.Repeat("a", 64)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: draft.ID, OwnerID: owner, Hash: pgtype.Text{String: packageHash, Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	objectKey := draft.ID.String() + "/test.zip"
	storedKey, err := db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash, ObjectKey: pgtype.Text{String: objectKey, Valid: true}})
	require.NoError(t, err)
	require.Equal(t, objectKey, storedKey.String)
	duplicateKey, err := db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash, ObjectKey: pgtype.Text{String: draft.ID.String() + "/duplicate.zip", Valid: true}})
	require.NoError(t, err)
	require.Equal(t, objectKey, duplicateKey.String, "duplicate content keeps its first object key")
	_, err = db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: other})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	adminPreview, err := db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: technicalAdmin, TechnicalAdmin: true})
	require.NoError(t, err)
	require.Equal(t, objectKey, adminPreview.ObjectKey.String)
	preview, err := db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: owner})
	require.NoError(t, err)
	require.Equal(t, objectKey, preview.ObjectKey.String)
	require.Empty(t, preview.Bytes)
	_, err = db.GetPublishedLuaProjectPackage(ctx, database.GetPublishedLuaProjectPackageParams{ID: draft.ID, Channel: "stable"})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	// A replaced draft queues its former object key for post-commit removal.
	newHash := strings.Repeat("b", 64)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: draft.ID, OwnerID: owner, Hash: pgtype.Text{String: newHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	_, err = db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: newHash, ObjectKey: pgtype.Text{String: draft.ID.String() + "/new.zip", Valid: true}})
	require.NoError(t, err)
	require.NoError(t, db.PruneLuaProjectArtifacts(ctx, database.PruneLuaProjectArtifactsParams{ID: draft.ID, OwnerID: owner}))
	garbage, err := db.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.Contains(t, garbage, objectKey)
	_, err = db.GetLuaProjectArtifact(ctx, database.GetLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	guide, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "guide", Name: "Future", Slug: "future"})
	require.NoError(t, err)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: guide.ID, OwnerID: owner, Hash: pgtype.Text{String: "draft", Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = db.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: guide.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 2})
	require.True(t, errors.Is(err, pgx.ErrNoRows))
}

func TestLuaArtifactGarbageRemoval(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = objects.CreateBucket(ctx, luaProjectBucket, storage.BucketOptions{Public: false})
	require.NoError(t, err)
	owner := uuid.New()
	_, err = zed.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "gc-" + owner.String()})
	require.NoError(t, err)
	project, err := zed.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "GC", Slug: "gc"})
	require.NoError(t, err)
	oldHash, newHash := strings.Repeat("a", 64), strings.Repeat("b", 64)
	key := luaProjectObjectKey(project.ID)
	_, err = objects.UploadFile(ctx, luaProjectBucket, key, bytes.NewReader([]byte("zip")))
	require.NoError(t, err)
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: oldHash, Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = zed.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: oldHash, ObjectKey: pgtype.Text{String: key, Valid: true}})
	require.NoError(t, err)
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: newHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	require.NoError(t, zed.PruneLuaProjectArtifacts(ctx, database.PruneLuaProjectArtifactsParams{ID: project.ID, OwnerID: owner}))

	api := &API{Opts: &Options{Zed: zed, Storage: objects, Logger: slog.Default()}}
	api.drainLuaArtifactGarbage(ctx)
	_, err = objects.DownloadFile(ctx, luaProjectBucket, key)
	require.ErrorIs(t, err, storage.ErrFileNotFound)
	pending, err := zed.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.NotContains(t, pending, key)
}

func TestLuaZIPObjectStorage(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = objects.CreateBucket(ctx, luaProjectBucket, storage.BucketOptions{Public: false})
	require.NoError(t, err)
	api := &API{Opts: &Options{Storage: objects, Logger: slog.Default()}}
	projectID := uuid.New()
	first, second := luaProjectObjectKey(projectID), luaProjectObjectKey(projectID)
	require.NotEqual(t, first, second)
	data := []byte("zip content")
	digest := sha256.Sum256(data)
	_, err = objects.UploadFile(ctx, luaProjectBucket, first, bytes.NewReader(data))
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	archive, ok := api.luaZIP(rec, req, nil, pgtype.Text{String: first, Valid: true}, hex.EncodeToString(digest[:]))
	require.True(t, ok)
	require.Equal(t, data, archive)

	rec = httptest.NewRecorder()
	_, ok = api.luaZIP(rec, req, nil, pgtype.Text{String: first, Valid: true}, strings.Repeat("0", 64))
	require.False(t, ok)
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	archive, ok = api.luaZIP(httptest.NewRecorder(), req, []byte("legacy"), pgtype.Text{}, "")
	require.True(t, ok)
	require.Equal(t, []byte("legacy"), archive)
}
