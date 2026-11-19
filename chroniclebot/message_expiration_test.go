package chroniclebot

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type expirationQueue struct {
	args []ArgsDeleteDiscordMessage
	opts []river.InsertOpts
	err  error
}

func (q *expirationQueue) Insert(_ context.Context, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.args = append(q.args, args.(ArgsDeleteDiscordMessage))
	q.opts = append(q.opts, *opts)
	return nil, q.err
}

func TestAdminNotificationExpiration(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name         string
		expire       time.Duration
		missingQueue bool
		sendError    bool
		queueError   bool
		wantError    bool
		wantRequests int
		wantJobs     int
	}{
		{name: "persistent", wantRequests: 1},
		{name: "expires", expire: 24 * time.Hour, wantRequests: 1, wantJobs: 1},
		{name: "missing queue", expire: 24 * time.Hour, missingQueue: true, wantError: true},
		{name: "send failure", expire: 24 * time.Hour, sendError: true, wantError: true, wantRequests: 1},
		{name: "schedule failure removes message", expire: 24 * time.Hour, queueError: true, wantError: true, wantRequests: 2, wantJobs: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			bot, err := New(context.Background(), testutil.Logger(t), Config{Token: "test"})
			require.NoError(t, err)
			requests := 0
			bot.session.Client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
				requests++
				require.True(t, strings.HasSuffix(strings.TrimSuffix(req.URL.Path, "/message-id"), "/channels/admins/messages"))
				status, body := http.StatusOK, `{"id":"message-id","channel_id":"admins"}`
				if tc.sendError {
					status, body = http.StatusForbidden, `{"code":50013,"message":"Missing Permissions"}`
				}
				if req.Method == http.MethodDelete {
					status, body = http.StatusNoContent, ""
				}
				return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: req}, nil
			})
			queue := &expirationQueue{}
			if tc.queueError {
				queue.err = errors.New("offline")
			}
			worker := &WorkerNotifyAdmin{bot: bot, queue: queue}
			if tc.missingQueue {
				worker.queue = nil
			}
			before := time.Now()
			err = worker.Work(context.Background(), &river.Job[ArgsNotifyAdmin]{Args: ArgsNotifyAdmin{ChannelID: "admins", ExpireAfter: tc.expire}})
			after := time.Now()
			if tc.wantError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
			require.Equal(t, tc.wantRequests, requests)
			require.Len(t, queue.args, tc.wantJobs)
			if tc.wantJobs > 0 {
				require.Equal(t, ArgsDeleteDiscordMessage{ChannelID: "admins", MessageID: "message-id"}, queue.args[0])
				require.False(t, queue.opts[0].ScheduledAt.Before(before.Add(tc.expire)))
				require.False(t, queue.opts[0].ScheduledAt.After(after.Add(tc.expire)))
			}
		})
	}
}

func TestDeleteDiscordMessage(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name      string
		status    int
		body      string
		wantError bool
	}{
		{name: "deleted", status: http.StatusNoContent},
		{name: "already deleted", status: http.StatusNotFound, body: `{"code":10008,"message":"Unknown Message"}`},
		{name: "forbidden errors", status: http.StatusForbidden, body: `{"code":50013,"message":"Missing Permissions"}`, wantError: true},
		{name: "unknown channel errors", status: http.StatusNotFound, body: `{"code":10003,"message":"Unknown Channel"}`, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			bot, err := New(context.Background(), testutil.Logger(t), Config{Token: "test"})
			require.NoError(t, err)
			bot.session.Client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
				require.Equal(t, http.MethodDelete, req.Method)
				require.True(t, strings.HasSuffix(req.URL.Path, "/channels/admins/messages/message-id"))
				return &http.Response{StatusCode: tc.status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body)), Request: req}, nil
			})
			args := ArgsDeleteDiscordMessage{ChannelID: "admins", MessageID: "message-id"}
			require.Equal(t, KindDeleteDiscordMessage, args.Kind())
			require.Equal(t, riverconst.QueueDiscordAnnouncements, args.InsertOpts().Queue)
			require.Equal(t, 1, args.InsertOpts().MaxAttempts)
			err = bot.NewWorkerDeleteDiscordMessage().Work(context.Background(), &river.Job[ArgsDeleteDiscordMessage]{Args: args})
			if tc.wantError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestAdminNotificationExpirationSerialization(t *testing.T) {
	t.Parallel()
	args := ArgsNotifyAdmin{ChannelID: "admins", ExpireAfter: 24 * time.Hour}
	encoded, err := json.Marshal(args)
	require.NoError(t, err)
	var decoded ArgsNotifyAdmin
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.Equal(t, args.ExpireAfter, decoded.ExpireAfter)
	// Jobs queued before expiration was added remain permanent.
	var legacy ArgsNotifyAdmin
	require.NoError(t, json.Unmarshal([]byte(`{"channel_id":"admins"}`), &legacy))
	require.Zero(t, legacy.ExpireAfter)
}
