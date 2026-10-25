package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestWoWLogArtifactDownloadUsesRawLogPermission(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	store := servicedbstore.DatabaseStore(broker)
	objectStorage, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = objectStorage.CreateBucket(ctx, chronicle.BucketRaidLogs, storage.BucketOptions{})
	require.NoError(t, err)

	ownerID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "artifact-download-" + ownerID.String()})
	require.NoError(t, err)
	logID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	artifactID := uuid.New()
	objectKey := "artifacts/" + logID.String() + "/" + artifactID.String()
	contents := []byte("sidekick telemetry")
	_, err = objectStorage.UploadFile(ctx, chronicle.BucketRaidLogs, objectKey, bytes.NewReader(contents))
	require.NoError(t, err)
	_, err = store.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
		ID: artifactID, LogGroupID: logID, Kind: "sidekick-storage", SchemaVersion: 2,
		Hash: "artifact-hash", SizeBytes: int64(len(contents)), MimeType: "text/plain;charset=UTF-8",
		ObjectKey: objectKey, OriginalFilename: pgtype.Text{String: "ChronicleSidekickBridgeWoTLK.lua", Valid: true},
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	handlerAPI := &API{
		Opts: &Options{Zed: zed, Storage: objectStorage},
		Zed:  zed,
	}
	router := chi.NewRouter()
	router.Route("/{logID}", func(r chi.Router) {
		r.Use(httpmw.LogIDMiddleware)
		r.Get("/artifacts/{artifactID}/download", handlerAPI.WoWLogArtifactDownload)
	})

	request := func() *http.Request {
		req := httptest.NewRequest(http.MethodGet, "/"+logID.String()+"/artifacts/"+artifactID.String()+"/download", nil)
		return req.WithContext(authz.AsUser(req.Context(), ownerID))
	}

	forbidden := httptest.NewRecorder()
	router.ServeHTTP(forbidden, request())
	require.Equal(t, http.StatusForbidden, forbidden.Code, forbidden.Body.String())

	require.NoError(t, zed.SetStripeEntitlementRole(ctx, ownerID, "stripe_download_raw_logs", true))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request())
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.Equal(t, contents, response.Body.Bytes())
	require.Equal(t, "text/plain;charset=UTF-8", response.Header().Get("Content-Type"))
	require.Equal(t, `attachment; filename=ChronicleSidekickBridgeWoTLK.lua`, response.Header().Get("Content-Disposition"))
	require.Equal(t, "18", response.Header().Get("Content-Length"))
}
