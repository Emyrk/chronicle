package servicetelemetry

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestWorkerPollsNoticesDuringReportDebounce(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)

	deploymentInfo, err := store.GetDeploymentInfo(ctx)
	require.NoError(t, err)
	require.NoError(t, store.UpdateTelemetryHeartbeat(ctx))

	startsAt := time.Date(2026, time.October, 4, 12, 0, 0, 0, time.UTC)
	notice := Notice{
		ID:        "maintenance-1",
		Audience:  "admin",
		Category:  "maintenance",
		Severity:  "warning",
		Title:     "Planned maintenance",
		Message:   "Upgrade before the maintenance window.",
		StartsAt:  startsAt,
		ExpiresAt: startsAt.Add(24 * time.Hour),
		UpdatedAt: startsAt,
	}

	type capturedRequest struct {
		Authorization string
		DeploymentID  string
	}
	type requestResult struct {
		Request capturedRequest
		Method  string
		Err     error
	}
	requests := make(chan requestResult, 2)
	validResponse, err := json.Marshal(checkNoticesResponse{Notices: &[]Notice{notice}})
	require.NoError(t, err)
	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request checkNoticesRequest
		decodeErr := json.NewDecoder(r.Body).Decode(&request)
		requests <- requestResult{
			Request: capturedRequest{
				Authorization: r.Header.Get("Authorization"),
				DeploymentID:  request.DeploymentID,
			},
			Method: r.Method,
			Err:    decodeErr,
		}

		if requestCount.Add(1) == 1 {
			_, _ = w.Write(validResponse)
			return
		}
		_, _ = w.Write([]byte(`{"notices":`))
	}))
	t.Cleanup(server.Close)

	var logs bytes.Buffer
	worker := &Worker{
		Store:           store,
		Logger:          slog.New(slog.NewJSONHandler(&logs, nil)),
		CheckNoticesURL: server.URL,
		ReportURL:       server.URL,
	}

	require.NoError(t, worker.Work(ctx, nil))
	firstResult := <-requests
	require.NoError(t, firstResult.Err)
	require.Equal(t, http.MethodPost, firstResult.Method)
	firstRequest := firstResult.Request
	require.Equal(t, deploymentInfo.ID.String(), firstRequest.DeploymentID)
	require.True(t, strings.HasPrefix(firstRequest.Authorization, "Bearer "))
	token := strings.TrimPrefix(firstRequest.Authorization, "Bearer ")
	require.NotEmpty(t, token)
	tokenBytes, err := base64.RawURLEncoding.DecodeString(token)
	require.NoError(t, err)
	require.Len(t, tokenBytes, 32)

	storedDeploymentInfo, err := store.GetDeploymentInfo(ctx)
	require.NoError(t, err)
	require.True(t, storedDeploymentInfo.DeploymentToken.Valid)
	require.Equal(t, token, storedDeploymentInfo.DeploymentToken.String)

	storedNotices, err := store.ListTelemetryNotices(ctx)
	require.NoError(t, err)
	require.Len(t, storedNotices, 1)
	require.Equal(t, notice.ID, storedNotices[0].ID)
	require.Equal(t, notice.Audience, storedNotices[0].Audience)
	require.Equal(t, notice.Category, storedNotices[0].Category)
	require.Equal(t, notice.Severity, storedNotices[0].Severity)
	require.Equal(t, notice.Title, storedNotices[0].Title)
	require.Equal(t, notice.Message, storedNotices[0].Message)
	require.WithinDuration(t, notice.StartsAt, storedNotices[0].StartsAt.Time, time.Microsecond)
	require.WithinDuration(t, notice.ExpiresAt, storedNotices[0].ExpiresAt.Time, time.Microsecond)
	require.WithinDuration(t, notice.UpdatedAt, storedNotices[0].UpdatedAt.Time, time.Microsecond)

	// A malformed response must not replace the last known snapshot.
	require.NoError(t, worker.Work(ctx, nil))
	secondResult := <-requests
	require.NoError(t, secondResult.Err)
	require.Equal(t, http.MethodPost, secondResult.Method)
	require.Equal(t, firstRequest, secondResult.Request)

	storedNotices, err = store.ListTelemetryNotices(ctx)
	require.NoError(t, err)
	require.Len(t, storedNotices, 1)
	require.Equal(t, notice.ID, storedNotices[0].ID)

	// A persistence failure must roll back the delete and preserve the snapshot.
	require.Error(t, worker.replaceNotices(ctx, []Notice{notice, notice}))
	storedNotices, err = store.ListTelemetryNotices(ctx)
	require.NoError(t, err)
	require.Len(t, storedNotices, 1)
	require.Equal(t, notice.ID, storedNotices[0].ID)

	require.NotContains(t, logs.String(), token)
}

func TestWorkerSendReportUsesBearerTokenAndInjectedURL(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	const token = "deployment-secret"
	requests := make(chan *http.Request, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests <- r.Clone(context.Background())
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	worker := &Worker{ReportURL: server.URL}
	worker.setDefaults()
	require.NoError(t, worker.sendReport(ctx, TelemetryReport{DeploymentID: "deployment-id"}, token))

	request := <-requests
	require.Equal(t, http.MethodPost, request.Method)
	require.Equal(t, "Bearer "+token, request.Header.Get("Authorization"))
	require.Equal(t, "application/json", request.Header.Get("Content-Type"))
}

func TestValidateNotice(t *testing.T) {
	t.Parallel()
	valid := Notice{
		ID:        "notice-id",
		Audience:  "public",
		Category:  "announcement",
		Severity:  "info",
		Title:     "Title",
		Message:   "Message",
		StartsAt:  time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
		UpdatedAt: time.Now(),
	}
	require.NoError(t, validateNotice(valid))

	tests := map[string]func(*Notice){
		"missing id":       func(n *Notice) { n.ID = " " },
		"missing title":    func(n *Notice) { n.Title = " " },
		"missing message":  func(n *Notice) { n.Message = " " },
		"invalid audience": func(n *Notice) { n.Audience = "everyone" },
		"invalid category": func(n *Notice) { n.Category = "other" },
		"invalid severity": func(n *Notice) { n.Severity = "urgent" },
		"missing starts at": func(n *Notice) {
			n.StartsAt = time.Time{}
		},
		"missing expires at": func(n *Notice) {
			n.ExpiresAt = time.Time{}
		},
		"missing updated at": func(n *Notice) {
			n.UpdatedAt = time.Time{}
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			notice := valid
			mutate(&notice)
			require.Error(t, validateNotice(notice))
		})
	}
}

func TestServiceScheduleIsHourly(t *testing.T) {
	t.Parallel()
	require.Equal(t, time.Hour, New(nil).Schedule)
}
