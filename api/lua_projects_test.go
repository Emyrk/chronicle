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
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
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
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: "draft", Valid: true}, Icon: pgtype.Text{String: "swords", Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: "stale", Valid: true}, ExpectedRevision: 1})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	unstable, err := db.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	require.Equal(t, "draft", unstable.UnstableHash.String)
	require.Equal(t, "swords", unstable.UnstableIcon.String, "the icon travels with the release")
	_, err = db.PromoteLuaProjectStable(ctx, database.PromoteLuaProjectStableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: other, Valid: true}, ExpectedRevision: 3, TestedSha256: pgtype.Text{String: "draft", Valid: true}})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.PromoteLuaProjectStable(ctx, database.PromoteLuaProjectStableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 3, TestedSha256: pgtype.Text{String: "untested", Valid: true}})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	stable, err := db.PromoteLuaProjectStable(ctx, database.PromoteLuaProjectStableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 3, TestedSha256: pgtype.Text{String: "draft", Valid: true}})
	require.NoError(t, err)
	require.Equal(t, unstable.UnstableHash, stable.StableHash)
	require.Equal(t, "swords", stable.StableIcon.String)
	require.Equal(t, "swords", luaProjectResponse(stable, false).Stable.Icon)
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
	storedKey, err := db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash, ObjectKey: objectKey, MimeType: "application/zip", UncompressedSizeBytes: 42, StoredSizeBytes: 64})
	require.NoError(t, err)
	require.Equal(t, objectKey, storedKey)
	duplicateKey, err := db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash, ObjectKey: draft.ID.String() + "/duplicate.zip", MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1})
	require.NoError(t, err)
	require.Equal(t, objectKey, duplicateKey, "duplicate content keeps its first object key")
	artifact, err := db.GetLuaProjectArtifact(ctx, database.GetLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash})
	require.NoError(t, err)
	require.Equal(t, objectKey, artifact.ObjectKey)
	require.Equal(t, "application/zip", artifact.MimeType)
	require.False(t, artifact.ContentEncoding.Valid)
	require.Equal(t, int64(42), artifact.UncompressedSizeBytes)
	require.Equal(t, int64(64), artifact.StoredSizeBytes)
	_, err = db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: other})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	adminPreview, err := db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: technicalAdmin, TechnicalAdmin: true})
	require.NoError(t, err)
	require.Equal(t, objectKey, adminPreview.ObjectKey)
	require.Equal(t, "application/zip", adminPreview.MimeType)
	require.False(t, adminPreview.ContentEncoding.Valid)
	preview, err := db.GetOwnerLuaProjectDraftPackage(ctx, database.GetOwnerLuaProjectDraftPackageParams{ID: draft.ID, OwnerID: owner})
	require.NoError(t, err)
	require.Equal(t, objectKey, preview.ObjectKey)
	require.Equal(t, "application/zip", preview.MimeType)
	require.False(t, preview.ContentEncoding.Valid)
	_, err = db.GetPublishedLuaProjectArtifact(ctx, database.GetPublishedLuaProjectArtifactParams{ID: draft.ID, Hash: packageHash})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	// A replaced draft queues its former object key for post-commit removal.
	newHash := strings.Repeat("b", 64)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: draft.ID, OwnerID: owner, Hash: pgtype.Text{String: newHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	_, err = db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: newHash, ObjectKey: draft.ID.String() + "/new.zip", MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1})
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
	_, err = zed.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: oldHash, ObjectKey: key, MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1})
	require.NoError(t, err)
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: newHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	require.NoError(t, zed.PruneLuaProjectArtifacts(ctx, database.PruneLuaProjectArtifactsParams{ID: project.ID, OwnerID: owner}))

	backlog := prometheus.NewGauge(prometheus.GaugeOpts{Name: "lua_test_gc_backlog"})
	api := &API{Opts: &Options{Zed: zed, Storage: objects, Logger: slog.Default()}, luaArtifactBacklog: backlog}
	api.refreshLuaArtifactBacklog(ctx)
	var metric dto.Metric
	require.NoError(t, backlog.Write(&metric))
	require.Equal(t, float64(1), metric.GetGauge().GetValue())
	api.drainLuaArtifactGarbage(ctx)
	api.refreshLuaArtifactBacklog(ctx)
	require.NoError(t, backlog.Write(&metric))
	require.Equal(t, float64(0), metric.GetGauge().GetValue())
	_, err = objects.DownloadFile(ctx, luaProjectBucket, key)
	require.ErrorIs(t, err, storage.ErrFileNotFound)
	pending, err := zed.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.NotContains(t, pending, key)
}

type failingLuaRemoval struct {
	storage.ObjectStorage
	fail bool
}

func (s *failingLuaRemoval) RemoveFile(ctx context.Context, bucket string, paths []string) ([]storage.FileUploadResponse, error) {
	if s.fail {
		return nil, errors.New("injected object delete failure")
	}
	return s.ObjectStorage.RemoveFile(ctx, bucket, paths)
}

func TestLuaUploadIntentRecovery(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = objects.CreateBucket(ctx, luaProjectBucket, storage.BucketOptions{Public: false})
	require.NoError(t, err)
	storageWithFailure := &failingLuaRemoval{ObjectStorage: objects, fail: true}
	api := &API{Opts: &Options{Zed: zed, Storage: storageWithFailure, Logger: slog.Default()}}
	key := luaProjectObjectKey(uuid.New())
	require.NoError(t, zed.RegisterLuaProjectUpload(ctx, key))
	_, err = objects.UploadFile(ctx, luaProjectBucket, key, bytes.NewReader([]byte("uncommitted")))
	require.NoError(t, err)

	// An uncertain upload/transaction result leaves its intent and object
	// alone; a delayed storage write cannot race an immediate delete.
	pending, err := zed.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.Contains(t, pending, key)
	api.drainLuaArtifactGarbage(ctx)
	_, err = objects.DownloadFile(ctx, luaProjectBucket, key)
	require.NoError(t, err, "an active upload must not be collected")

	// Advance only the SQL selection cutoff, not wall-clock time. A failed
	// deletion remains claimed and is retried after the two-minute lease.
	future := time.Now().Add(11 * time.Minute)
	api.drainLuaArtifactGarbageAt(ctx, future)
	storageWithFailure.fail = false
	api.drainLuaArtifactGarbageAt(ctx, future.Add(time.Minute))
	_, err = objects.DownloadFile(ctx, luaProjectBucket, key)
	require.NoError(t, err, "the first claim must exclude another replica")
	api.drainLuaArtifactGarbageAt(ctx, future.Add(3*time.Minute))
	_, err = objects.DownloadFile(ctx, luaProjectBucket, key)
	require.ErrorIs(t, err, storage.ErrFileNotFound)
	pending, err = zed.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.NotContains(t, pending, key)
}

func TestLuaUploadIntentFinalization(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed, _ := dbtestutil.NewDB(t)
	owner := uuid.New()
	_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "intent-" + owner.String()})
	require.NoError(t, err)
	project, err := zed.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Intent", Slug: "intent"})
	require.NoError(t, err)
	key := luaProjectObjectKey(project.ID)
	require.NoError(t, zed.RegisterLuaProjectUpload(ctx, key))
	hash := strings.Repeat("a", 64)
	require.NoError(t, zed.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: hash, Valid: true}, ExpectedRevision: 1}); err != nil {
			return err
		}
		if _, err := tx.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: hash, ObjectKey: key, MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1}); err != nil {
			return err
		}
		_, err := tx.ConsumeLuaProjectUpload(ctx, key)
		return err
	}, nil))
	pending, err := zed.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.NotContains(t, pending, key)
	claimed, err := zed.ClaimLuaProjectArtifactGarbage(ctx, pgtype.Timestamptz{Time: time.Now().Add(11 * time.Minute), Valid: true})
	require.NoError(t, err)
	require.NotContains(t, claimed, key)

	// Even an erroneous tombstone must never remove a referenced artifact.
	require.NoError(t, zed.RegisterLuaProjectUpload(ctx, key))
	claimed, err = zed.ClaimLuaProjectArtifactGarbage(ctx, pgtype.Timestamptz{Time: time.Now().Add(11 * time.Minute), Valid: true})
	require.NoError(t, err)
	require.NotContains(t, claimed, key)
	_, err = zed.ConsumeLuaProjectUpload(ctx, key)
	require.NoError(t, err)

	// If a collector claims an expired upload first, the SQL artifact write
	// and draft revision must roll back rather than reference a deleted key.
	staleKey := luaProjectObjectKey(project.ID)
	require.NoError(t, zed.RegisterLuaProjectUpload(ctx, staleKey))
	claimed, err = zed.ClaimLuaProjectArtifactGarbage(ctx, pgtype.Timestamptz{Time: time.Now().Add(11 * time.Minute), Valid: true})
	require.NoError(t, err)
	require.Contains(t, claimed, staleKey)
	err = zed.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: strings.Repeat("b", 64), Valid: true}, ExpectedRevision: 2}); err != nil {
			return err
		}
		if _, err := tx.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: strings.Repeat("b", 64), ObjectKey: staleKey, MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1}); err != nil {
			return err
		}
		_, err := tx.ConsumeLuaProjectUpload(ctx, staleKey)
		return err
	}, nil)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	unchanged, err := zed.GetOwnerLuaProject(ctx, database.GetOwnerLuaProjectParams{ID: project.ID, OwnerID: owner})
	require.NoError(t, err)
	require.EqualValues(t, 2, unchanged.Revision)
}

type blockedLuaDownload struct {
	storage.ObjectStorage
	blocked bool
}

func (s *blockedLuaDownload) DownloadFile(ctx context.Context, bucket, path string, opts ...storage.UrlOptions) ([]byte, error) {
	if s.blocked {
		return nil, errors.New("download should not run for a matching ETag")
	}
	return s.ObjectStorage.DownloadFile(ctx, bucket, path, opts...)
}

func TestLuaPublishedHashCaching(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = objects.CreateBucket(ctx, luaProjectBucket, storage.BucketOptions{Public: false})
	require.NoError(t, err)
	owner := uuid.New()
	_, err = zed.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "hash-" + owner.String()})
	require.NoError(t, err)
	project, err := zed.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Hash", Slug: "hash"})
	require.NoError(t, err)
	data := []byte("published archive")
	digest := sha256.Sum256(data)
	hash := hex.EncodeToString(digest[:])
	key := luaProjectObjectKey(project.ID)
	_, err = objects.UploadFile(ctx, luaProjectBucket, key, bytes.NewReader(data))
	require.NoError(t, err)
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: hash, Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = zed.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: hash, ObjectKey: key, MimeType: "application/zip", UncompressedSizeBytes: int64(len(data)), StoredSizeBytes: int64(len(data))})
	require.NoError(t, err)

	trackedStorage := &blockedLuaDownload{ObjectStorage: objects}
	api := &API{Opts: &Options{Zed: zed, Storage: trackedStorage, Logger: slog.Default()}}
	router := chi.NewRouter()
	router.Get("/me/lua-projects/{projectID}/draft/{hash}/package", api.DownloadMyLuaProjectDraft)
	router.Get("/lua-projects/{projectID}/artifacts/{hash}/package", api.DownloadLuaProject)
	url := "/lua-projects/" + project.ID.String() + "/artifacts/" + hash + "/package"
	get := func(path string, requestCtx context.Context, headers map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil).WithContext(requestCtx)
		for name, value := range headers {
			req.Header.Set(name, value)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	require.Equal(t, http.StatusNotFound, get(url, ctx, nil).Code, "draft hashes are not public")
	draftURL := "/me/lua-projects/" + project.ID.String() + "/draft/" + hash + "/package"
	ownerCtx := authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: owner}), owner)
	rec := get(draftURL, ownerCtx, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, data, rec.Body.Bytes())
	require.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, http.StatusNotFound, get("/me/lua-projects/"+project.ID.String()+"/draft/"+strings.Repeat("a", 64)+"/package", ownerCtx, nil).Code)
	require.Equal(t, http.StatusForbidden, get(draftURL, ctx, nil).Code)
	_, err = zed.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	rec = get(url, ctx, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, data, rec.Body.Bytes())
	require.Equal(t, `"`+hash+`"`, rec.Header().Get("ETag"))
	require.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))
	require.Equal(t, "application/zip", rec.Header().Get("Content-Type"))
	trackedStorage.blocked = true
	rec = get(url, ctx, map[string]string{"If-None-Match": `"` + hash + `"`})
	require.Equal(t, http.StatusNotModified, rec.Code)
	require.Empty(t, rec.Body.Bytes())
	trackedStorage.blocked = false
	rec = get(url, authz.AsUser(ctx, owner), map[string]string{"Cookie": "session=example"})
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "private, max-age=3600", rec.Header().Get("Cache-Control"))
	refreshRouter := chi.NewRouter()
	refreshRouter.Get("/lua-projects/{projectID}/artifacts/{hash}/package", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Set-Cookie", "session=refreshed; HttpOnly")
		api.DownloadLuaProject(w, r)
	})
	rec = httptest.NewRecorder()
	refreshRouter.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil).WithContext(ctx))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, http.StatusBadRequest, get("/lua-projects/"+project.ID.String()+"/artifacts/invalid/package", ctx, nil).Code)

	nextData := []byte("updated archive")
	nextDigest := sha256.Sum256(nextData)
	nextHash := hex.EncodeToString(nextDigest[:])
	nextKey := luaProjectObjectKey(project.ID)
	_, err = objects.UploadFile(ctx, luaProjectBucket, nextKey, bytes.NewReader(nextData))
	require.NoError(t, err)
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, OwnerID: owner, Hash: pgtype.Text{String: nextHash, Valid: true}, ExpectedRevision: 3})
	require.NoError(t, err)
	_, err = zed.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: nextHash, ObjectKey: nextKey, MimeType: "application/zip", UncompressedSizeBytes: int64(len(nextData)), StoredSizeBytes: int64(len(nextData))})
	require.NoError(t, err)
	_, err = zed.PublishLuaProjectUnstable(ctx, database.PublishLuaProjectUnstableParams{ID: project.ID, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 4})
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, get(url, ctx, map[string]string{"If-None-Match": `"` + hash + `"`}).Code, "rotated hashes cannot be revalidated")
	url = "/lua-projects/" + project.ID.String() + "/artifacts/" + nextHash + "/package"
	require.Equal(t, http.StatusOK, get(url, ctx, nil).Code)

	publicRelation := policy.New().Lua_project(project.ID).Object()
	require.NoError(t, zed.Delete(ctx, rel.NewPreconditionedFilter(rel.NewFilter(publicRelation.Typ, publicRelation.ID, "public_viewer"))))
	require.Equal(t, http.StatusForbidden, get(url, ctx, map[string]string{"If-None-Match": `"` + nextHash + `"`}).Code)
	rec = get(url, authz.AsUser(ctx, owner), nil)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
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
	archive, ok := api.luaZIP(rec, req, first, hex.EncodeToString(digest[:]), "application/zip", pgtype.Text{})
	require.True(t, ok)
	require.Equal(t, data, archive)

	rec = httptest.NewRecorder()
	_, ok = api.luaZIP(rec, req, first, strings.Repeat("0", 64), "application/zip", pgtype.Text{})
	require.False(t, ok)
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	for _, unsupported := range []struct {
		mimeType string
		encoding pgtype.Text
	}{
		{mimeType: "text/html"},
		{mimeType: "application/zip", encoding: pgtype.Text{String: "gzip", Valid: true}},
	} {
		rec = httptest.NewRecorder()
		_, ok = api.luaZIP(rec, req, first, hex.EncodeToString(digest[:]), unsupported.mimeType, unsupported.encoding)
		require.False(t, ok)
		require.Equal(t, http.StatusInternalServerError, rec.Code)
	}
}
