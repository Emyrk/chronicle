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
	_, err = db.GetPublicLuaProject(ctx, project.ID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	first := strings.Repeat("1", 64)
	saved, err := db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: first, Valid: true}, Icon: pgtype.Text{String: "swords", Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: "stale", Valid: true}, ExpectedRevision: 1})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.GetPublicLuaProject(ctx, project.ID)
	require.NoError(t, err, "main is runnable before any release")

	// A release tags the current main, keeping its icon and who tagged it.
	release, err := db.CreateLuaProjectRelease(ctx, database.CreateLuaProjectReleaseParams{ID: project.ID, Tag: "v1", ActorID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: saved.Revision})
	require.NoError(t, err)
	require.Equal(t, first, release.Hash.String)
	require.Equal(t, "swords", release.Icon.String, "the icon travels with the release")
	require.Equal(t, owner, release.PublishedBy.UUID)
	_, err = db.CreateLuaProjectRelease(ctx, database.CreateLuaProjectReleaseParams{ID: project.ID, Tag: "v2", ExpectedRevision: saved.Revision})
	require.ErrorIs(t, err, pgx.ErrNoRows, "a stale revision cannot tag a newer main")
	current, err := db.GetLuaProject(ctx, project.ID)
	require.NoError(t, err)
	_, err = db.CreateLuaProjectRelease(ctx, database.CreateLuaProjectReleaseParams{ID: project.ID, Tag: "v1", ExpectedRevision: current.Revision})
	require.Error(t, err, "tags are unique")

	// Only the newest releases keep files; older ones stay listed without a package.
	for index, tag := range []string{"v2", "v3", "v4"} {
		current, err = db.GetLuaProject(ctx, project.ID)
		require.NoError(t, err)
		saved, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: strings.Repeat(string(rune('2'+index)), 64), Valid: true}, ExpectedRevision: current.Revision})
		require.NoError(t, err)
		actor := owner
		if tag == "v4" {
			actor = technicalAdmin
		}
		_, err = db.CreateLuaProjectRelease(ctx, database.CreateLuaProjectReleaseParams{ID: project.ID, Tag: tag, ActorID: uuid.NullUUID{UUID: actor, Valid: true}, ExpectedRevision: saved.Revision})
		require.NoError(t, err)
		require.NoError(t, db.TrimLuaProjectReleaseFiles(ctx, database.TrimLuaProjectReleaseFilesParams{ProjectID: project.ID, Keep: luaReleasesWithFiles}))
	}
	releases, err := db.ListLuaProjectReleases(ctx, project.ID)
	require.NoError(t, err)
	tags := make([]string, 0, len(releases))
	for _, release := range releases {
		tags = append(tags, release.Tag)
	}
	require.Equal(t, []string{"v4", "v3", "v2", "v1"}, tags)
	require.False(t, releases[3].Hash.Valid, "v1 no longer has files")
	require.True(t, releases[2].Hash.Valid)
	require.Equal(t, technicalAdmin, releases[0].PublishedBy.UUID)
	response := luaProjectResponse(current, releases, map[uuid.UUID]string{owner: "steven", technicalAdmin: "admin-1"})
	require.False(t, response.Releases[3].Available)
	require.True(t, response.Releases[0].Available)
	require.Equal(t, "steven", response.Author)
	require.Equal(t, "admin-1", response.Releases[0].PublishedByAuthor, "releases name their publisher")
	adminEdited, err := db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: strings.Repeat("9", 64), Valid: true}, ExpectedRevision: mustRevision(t, ctx, db, project.ID)})
	require.NoError(t, err)
	require.Equal(t, owner, adminEdited.OwnerID, "admin update must not transfer ownership")
	// SpiceDB decides who may read drafts (see TestLuaProjectPermissions); SQL only scopes by project.
	draft, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Preview", Slug: "preview"})
	require.NoError(t, err)
	packageHash := strings.Repeat("a", 64)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: draft.ID, Hash: pgtype.Text{String: packageHash, Valid: true}, ExpectedRevision: 1})
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
	preview, err := db.GetLuaProjectDraftPackage(ctx, draft.ID)
	require.NoError(t, err)
	require.Equal(t, objectKey, preview.ObjectKey)
	require.Equal(t, "application/zip", preview.MimeType)
	require.False(t, preview.ContentEncoding.Valid)
	served, err := db.GetPublishedLuaProjectArtifact(ctx, database.GetPublishedLuaProjectArtifactParams{ID: draft.ID, Hash: packageHash})
	require.NoError(t, err, "main is servable to anyone who can view")
	require.Equal(t, objectKey, served.ObjectKey)
	// A replaced draft queues its former object key for post-commit removal.
	newHash := strings.Repeat("b", 64)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: draft.ID, Hash: pgtype.Text{String: newHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	_, err = db.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: draft.ID, Hash: newHash, ObjectKey: draft.ID.String() + "/new.zip", MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1})
	require.NoError(t, err)
	require.NoError(t, db.PruneLuaProjectArtifacts(ctx, draft.ID))
	garbage, err := db.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.Contains(t, garbage, objectKey)
	_, err = db.GetLuaProjectArtifact(ctx, database.GetLuaProjectArtifactParams{ProjectID: draft.ID, Hash: packageHash})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	deleted, err := db.DeleteLuaProject(ctx, draft.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)
	garbage, err = db.ListLuaProjectArtifactGarbage(ctx)
	require.NoError(t, err)
	require.Contains(t, garbage, draft.ID.String()+"/new.zip", "whole-addon deletion queues its remaining package")
	_, err = db.GetLuaProject(ctx, draft.ID)
	require.ErrorIs(t, err, pgx.ErrNoRows)

	guide, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "guide", Name: "Future", Slug: "future"})
	require.NoError(t, err)
	_, err = db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: guide.ID, Hash: pgtype.Text{String: "draft", Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = db.CreateLuaProjectRelease(ctx, database.CreateLuaProjectReleaseParams{ID: guide.ID, Tag: "v1", ActorID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: 2})
	require.True(t, errors.Is(err, pgx.ErrNoRows), "guides cannot be released yet")
}

func mustRevision(t *testing.T, ctx context.Context, db database.Store, id uuid.UUID) int64 {
	t.Helper()
	project, err := db.GetLuaProject(ctx, id)
	require.NoError(t, err)
	return project.Revision
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
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: oldHash, Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	_, err = zed.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: oldHash, ObjectKey: key, MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1})
	require.NoError(t, err)
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: newHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	require.NoError(t, zed.PruneLuaProjectArtifacts(ctx, project.ID))

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
		if _, err := tx.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: hash, Valid: true}, ExpectedRevision: 1}); err != nil {
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
		if _, err := tx.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: strings.Repeat("b", 64), Valid: true}, ExpectedRevision: 2}); err != nil {
			return err
		}
		if _, err := tx.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: strings.Repeat("b", 64), ObjectKey: staleKey, MimeType: "application/zip", UncompressedSizeBytes: 1, StoredSizeBytes: 1}); err != nil {
			return err
		}
		_, err := tx.ConsumeLuaProjectUpload(ctx, staleKey)
		return err
	}, nil)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	unchanged, err := zed.GetLuaProject(ctx, project.ID)
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
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: hash, Valid: true}, ExpectedRevision: 1})
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

	// Main is runnable by anyone who can view, so its package is public like a release's.
	draftURL := "/me/lua-projects/" + project.ID.String() + "/draft/" + hash + "/package"
	ownerCtx := authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: owner}), owner)
	rec := get(draftURL, ownerCtx, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, data, rec.Body.Bytes())
	require.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, http.StatusNotFound, get("/me/lua-projects/"+project.ID.String()+"/draft/"+strings.Repeat("a", 64)+"/package", ownerCtx, nil).Code)
	require.Equal(t, http.StatusForbidden, get(draftURL, ctx, nil).Code)
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
	_, err = zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: nextHash, Valid: true}, ExpectedRevision: 2})
	require.NoError(t, err)
	_, err = zed.PutLuaProjectArtifact(ctx, database.PutLuaProjectArtifactParams{ProjectID: project.ID, Hash: nextHash, ObjectKey: nextKey, MimeType: "application/zip", UncompressedSizeBytes: int64(len(nextData)), StoredSizeBytes: int64(len(nextData))})
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, get(url, ctx, map[string]string{"If-None-Match": `"` + hash + `"`}).Code, "an old main that was never released cannot be revalidated")
	url = "/lua-projects/" + project.ID.String() + "/artifacts/" + nextHash + "/package"
	require.Equal(t, http.StatusOK, get(url, ctx, nil).Code)

	publicRelation := policy.New().Lua_project(project.ID).Object()
	// Making the addon private removes both public grants: reading the source and running it.
	for _, relation := range []string{"viewer", "runner"} {
		require.NoError(t, zed.Delete(ctx, rel.NewPreconditionedFilter(rel.NewFilter(publicRelation.Typ, publicRelation.ID, relation))))
	}
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

func TestPublicLuaProjectsMostTrackedFirst(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t)
	users := make([]uuid.UUID, 3)
	for i := range users {
		users[i] = uuid.New()
		_, err := db.InsertUser(ctx, database.InsertUserParams{ID: users[i], Username: "u" + users[i].String(), Email: users[i].String() + "@example.org"})
		require.NoError(t, err)
	}
	release := func(name string) uuid.UUID {
		project, err := db.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: users[0], Kind: "panel", Name: name, Slug: name})
		require.NoError(t, err)
		saved, err := db.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: strings.Repeat("1", 64), Valid: true}, ExpectedRevision: 1})
		require.NoError(t, err)
		_, err = db.CreateLuaProjectRelease(ctx, database.CreateLuaProjectReleaseParams{ID: project.ID, Tag: "v1", ExpectedRevision: saved.Revision})
		require.NoError(t, err)
		return project.ID
	}
	popular, newest := release("popular"), release("newest")
	for _, user := range users[1:] {
		require.NoError(t, db.StarLuaProject(ctx, database.StarLuaProjectParams{ProjectID: popular, UserID: user}))
	}
	projects, err := db.ListPublicLuaProjects(ctx)
	require.NoError(t, err)
	require.Len(t, projects, 2)
	require.Equal(t, []uuid.UUID{popular, newest}, []uuid.UUID{projects[0].ID, projects[1].ID}, "stars outrank a newer release")
}
