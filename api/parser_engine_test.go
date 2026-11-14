package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/go-chi/chi/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParserEngineAuthorization(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)
	admin, user := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{admin, user} {
		_, err := db.InsertUser(ctx, database.InsertUserParams{ID: id, Username: id.String()})
		require.NoError(t, err)
	}
	require.NoError(t, zed.SetUserChronicleRoles(ctx, admin, []string{"technical_admin"}))
	api := &API{Zed: zed}
	for _, tc := range []struct {
		name, raw string
		actor     uuid.UUID
		status    int
		want      chroniclesdk.ParserEngine
	}{
		{"default", "", user, 200, ""}, {"legacy", "legacy", user, 200, chroniclesdk.ParserEngineLegacy},
		{"forged", "parsernext", user, 403, ""}, {"admin", "parsernext", admin, 200, chroniclesdk.ParserEngineNext},
		{"malformed", "nope", user, 400, ""}, {"tooling alias", "parsernext-vanilla", admin, 400, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/upload-v2?parser_engine="+tc.raw, nil).WithContext(authz.AsUser(ctx, tc.actor))
			rec := httptest.NewRecorder()
			got, ok := api.authorizeParserEngine(rec, req)
			require.Equal(t, tc.status, rec.Code)
			require.Equal(t, tc.status == 200, ok)
			require.Equal(t, tc.want, got)
			if tc.status != 200 {
				rec = httptest.NewRecorder()
				api.WoWLogUploadV2(rec, req)
				require.Equal(t, tc.status, rec.Code)
			}
		})
	}
}
func TestRetiredUploadCannotSelectParser(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	new(API).WoWLogUpload(rec, httptest.NewRequest(http.MethodPost, "/upload?parser_engine=parsernext", nil))
	require.Equal(t, http.StatusGone, rec.Code)
}

func TestUploadParserEngineHTTPToRiver(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)
	client, err := river.NewClient(riverpgxv5.New(servicepgxpool.PGXPool(broker)), &river.Config{})
	require.NoError(t, err)
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	c := &chronicle.Chronicle{Storage: objects, Zed: zed, TemporaryDirectory: t.TempDir()}
	c.SetQueue(&riverqueue.Queues{Client: client})
	a := &API{Zed: zed, Opts: &Options{Zed: zed}, Chronicle: c}
	admin, user := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{admin, user} {
		_, err = db.InsertUser(ctx, database.InsertUserParams{ID: id, Username: id.String()})
		require.NoError(t, err)
		_, err = db.UpsertDataGrant(ctx, database.UpsertDataGrantParams{UserID: id, Source: "engine-test", StorageBytes: 1 << 20})
		require.NoError(t, err)
	}
	require.NoError(t, zed.SetUserChronicleRoles(ctx, admin, []string{"technical_admin"}))
	// Subtests share one queue and assert exact insertion counts; run them serially.
	var nativeLog, userLog uuid.UUID
	for _, tc := range []struct {
		name, engine string
		actor        uuid.UUID
		status       int
	}{
		{"forbidden", "parsernext", user, 403}, {"malformed", "invalid", user, 400},
		{"unsupported", "parsernext", admin, 400}, {"native", "parsernext", admin, 201}, {"default", "", user, 201}, {"legacy", "legacy", user, 201},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			form := multipart.NewWriter(&body)
			file, err := form.CreateFormFile("combat_log", "combat.log")
			require.NoError(t, err)
			_, err = file.Write([]byte(fmt.Sprintf("1|SPELL_FAIL|client-side|%d|false\n", 125+len(tc.name))))
			require.NoError(t, err)
			require.NoError(t, form.Close())
			format := database.LogFormat112aCcAddon
			if tc.name == "unsupported" {
				format = database.LogFormat112aSuperwowAddon
			}
			req := httptest.NewRequest(http.MethodPost, "/upload-v2?format="+string(format)+"&parser_engine="+tc.engine, &body)
			req.Header.Set("Content-Type", form.FormDataContentType())
			req = req.WithContext(chronauth.WithClaims(authz.AsUser(ctx, tc.actor), &claims.Claims{Subject: tc.actor}))
			before, err := client.JobList(ctx, river.NewJobListParams())
			require.NoError(t, err)
			rec := httptest.NewRecorder()
			a.WoWLogUploadV2(rec, req)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
			after, err := client.JobList(ctx, river.NewJobListParams())
			require.NoError(t, err)
			if tc.status != 201 {
				require.Len(t, after.Jobs, len(before.Jobs))
				return
			}
			var response chroniclesdk.LogUploadResponse
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
			jobs, err := c.ListLogGroupJobs(ctx, response.LogID)
			require.NoError(t, err)
			require.Len(t, jobs.Jobs, 1)
			var args chronicle.ArgsLogParse
			require.NoError(t, json.Unmarshal(jobs.Jobs[0].EncodedArgs, &args))
			require.Equal(t, chroniclesdk.ParserEngine(tc.engine), args.ParserEngine)
			if tc.engine == "parsernext" {
				nativeLog = response.LogID
			}
			if tc.name == "default" {
				userLog = response.LogID
			}
		})
	}
	require.NotEqual(t, uuid.Nil, nativeLog)
	router := chi.NewRouter()
	router.Route("/{logID}", func(r chi.Router) { r.Use(httpmw.LogIDMiddleware); r.Post("/reparse", a.WoWLogReparse) })
	before, err := c.ListLogGroupJobs(ctx, userLog)
	require.NoError(t, err)
	denied := httptest.NewRecorder()
	router.ServeHTTP(denied, httptest.NewRequest(http.MethodPost, "/"+userLog.String()+"/reparse?parser_engine=parsernext", nil).WithContext(authz.AsUser(ctx, user)))
	require.Equal(t, http.StatusForbidden, denied.Code, denied.Body.String())
	after, err := c.ListLogGroupJobs(ctx, userLog)
	require.NoError(t, err)
	require.Len(t, after.Jobs, len(before.Jobs))
	for _, engine := range []string{"parsernext", ""} {
		req := httptest.NewRequest(http.MethodPost, "/"+nativeLog.String()+"/reparse?parser_engine="+engine, nil).WithContext(authz.AsUser(ctx, admin))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
		var id int64
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &id))
		job, err := client.JobGet(ctx, id)
		require.NoError(t, err)
		var args chronicle.ArgsLogReparse
		require.NoError(t, json.Unmarshal(job.EncodedArgs, &args))
		require.Equal(t, chroniclesdk.ParserEngine(engine), args.ParserEngine)
	}
}
