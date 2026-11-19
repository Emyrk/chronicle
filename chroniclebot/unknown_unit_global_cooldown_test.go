package chroniclebot

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertest"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestUnknownUnitGlobalCooldownOptions(t *testing.T) {
	t.Parallel()
	opts := (ArgsNotifyUnknownUnits{}).InsertOpts()
	require.False(t, opts.UniqueOpts.ByArgs, "all tenants, zones, channels and parse jobs share one slot")
	require.False(t, opts.UniqueOpts.ByQueue)
	require.Zero(t, opts.UniqueOpts.ByPeriod, "fixed time buckets could allow two alerts seconds apart")
	for _, state := range []rivertype.JobState{rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRunning, rivertype.JobStateRetryable, rivertype.JobStateScheduled} {
		require.Contains(t, opts.UniqueOpts.ByState, state)
	}
	require.NotContains(t, opts.UniqueOpts.ByState, rivertype.JobStateCompleted)
	require.Equal(t, 12*time.Hour, unknownUnitGlobalCooldown)
}

func TestUnknownUnitGlobalSuppressionReleasesLocalZone(t *testing.T) {
	t.Parallel()
	bot, err := New(context.Background(), testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	queue := &unknownUnitQueue{duplicate: true}
	zones := []UnknownUnitZoneSummary{{Zone: "A", GUIDs: 1}}
	require.NoError(t, EnqueueUnknownUnitNotification(context.Background(), queue, bot, uuid.Nil, 1, "", zones))
	require.Empty(t, bot.unknownUnitDebounce.entries)
	queue.duplicate = false
	require.NoError(t, EnqueueUnknownUnitNotification(context.Background(), queue, bot, uuid.Nil, 2, "", zones))
	require.Len(t, bot.unknownUnitDebounce.entries, 1)
}

func TestUnknownUnitCooldownWakeDoesNotSend(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name       string
		until      time.Time
		wantSnooze bool
	}{
		{name: "still cooling down", until: time.Now().Add(time.Hour), wantSnooze: true},
		{name: "expired", until: time.Now().Add(-time.Hour)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			metadata, err := json.Marshal(map[string]time.Time{unknownUnitCooldownMetadataKey: tc.until})
			require.NoError(t, err)
			// No notifier: any attempt to resend would panic.
			worker := &WorkerNotifyUnknownUnits{}
			err = worker.Work(context.Background(), &river.Job[ArgsNotifyUnknownUnits]{JobRow: &rivertype.JobRow{Metadata: metadata}})
			if tc.wantSnooze {
				var snooze *river.JobSnoozeError
				require.ErrorAs(t, err, &snooze)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestUnknownUnitGlobalCooldownAcrossClients(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	first, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
	require.NoError(t, err)
	second, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
	require.NoError(t, err)
	type insertResult struct {
		result *rivertype.JobInsertResult
		err    error
	}
	results := make(chan insertResult, 2)
	start := make(chan struct{})
	for i, client := range []*river.Client[pgx.Tx]{first, second} {
		go func() {
			<-start
			result, err := client.Insert(ctx, ArgsNotifyUnknownUnits{Notification: ArgsNotifyAdmin{ChannelID: fmt.Sprint(i), UniqueKey: fmt.Sprint(i)}}, nil)
			results <- insertResult{result, err}
		}()
	}
	close(start)
	a, b := <-results, <-results
	require.NoError(t, a.err)
	require.NoError(t, b.err)
	require.Equal(t, a.result.Job.ID, b.result.Job.ID)
	require.NotEqual(t, a.result.UniqueSkippedAsDuplicate, b.result.UniqueSkippedAsDuplicate)
}

func TestUnknownUnitGlobalCooldownPersistsAfterSend(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(context.Background()) }()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test"})
	require.NoError(t, err)
	sends := 0
	bot.session.Client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		sends++
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"message-id"}`)), Request: req}, nil
	})
	queue := &expirationQueue{}
	now := time.Now()
	worker := rivertest.NewWorker(t, riverpgxv5.New(pool), nil, &WorkerNotifyUnknownUnits{notifier: &WorkerNotifyAdmin{bot: bot, queue: queue}, now: func() time.Time { return now }})
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
	require.NoError(t, err)
	args := ArgsNotifyUnknownUnits{Notification: ArgsNotifyAdmin{ChannelID: "admins", ExpireAfter: 24 * time.Hour}}
	inserted, err := client.InsertTx(ctx, tx, args, nil)
	require.NoError(t, err)
	before := now
	result, err := worker.WorkJob(ctx, t, tx, inserted.Job)
	require.NoError(t, err)
	require.Equal(t, river.EventKindJobSnoozed, result.EventKind)
	require.Equal(t, rivertype.JobStateScheduled, result.Job.State)
	var metadata map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(result.Job.Metadata, &metadata))
	var until time.Time
	require.NoError(t, json.Unmarshal(metadata[unknownUnitCooldownMetadataKey], &until))
	require.False(t, until.Before(before.Add(12*time.Hour)))
	require.False(t, until.After(time.Now().Add(12*time.Hour)))
	require.Len(t, queue.args, 1, "24-hour expiration is still scheduled")
	// An early wake after a restart must snooze without sending a second message.
	again, err := worker.WorkJob(ctx, t, tx, result.Job)
	require.NoError(t, err)
	require.Equal(t, river.EventKindJobSnoozed, again.EventKind)
	require.Equal(t, 1, sends)
	suppressed, err := client.InsertTx(ctx, tx, args, nil)
	require.NoError(t, err)
	require.True(t, suppressed.UniqueSkippedAsDuplicate)
	// Simulate waking after the persisted deadline, then release the slot.
	now = until.Add(time.Nanosecond)
	completed, err := worker.WorkJob(ctx, t, tx, again.Job)
	require.NoError(t, err)
	require.Equal(t, river.EventKindJobCompleted, completed.EventKind)
	next, err := client.InsertTx(ctx, tx, args, nil)
	require.NoError(t, err)
	require.False(t, next.UniqueSkippedAsDuplicate)
	require.Equal(t, 1, sends)
}
