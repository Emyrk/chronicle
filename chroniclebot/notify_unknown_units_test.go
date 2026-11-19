package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type unknownUnitQueue struct {
	jobs      []ArgsNotifyAdmin
	err       error
	duplicate bool
}

func (q *unknownUnitQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.jobs = append(q.jobs, args.(ArgsNotifyUnknownUnits).Notification)
	return &rivertype.JobInsertResult{UniqueSkippedAsDuplicate: q.duplicate}, q.err
}

func TestUnknownUnitNotificationOnePerJob(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	bot.unknownUnitDebounce.now = func() time.Time { return now }
	queue := &unknownUnitQueue{}
	zones := []UnknownUnitZoneSummary{{Zone: "Zone B", Entries: 4, GUIDs: 20}, {Zone: "Zone A", Entries: 2, GUIDs: 7}}
	reportURL := "https://chronicle.example/logs/abc"
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 123, reportURL, zones))
	require.Len(t, queue.jobs, 1)
	job := queue.jobs[0]
	require.Equal(t, "Unknown unit categories in parse job", job.Title)
	require.Equal(t, reportURL, job.URL)
	require.Equal(t, "admins", job.ChannelID)
	require.Contains(t, job.Fields[0].Value, "2 zones; 27 unknown GUIDs")
	require.Equal(t, AdminNotificationField{Name: "Zone A", Value: "2 distinct entries; 7 GUIDs (per-instance sum)"}, job.Fields[1])
	require.Equal(t, AdminNotificationField{Name: "Zone B", Value: "4 distinct entries; 20 GUIDs (per-instance sum)"}, job.Fields[2])
	require.Equal(t, 24*time.Hour, job.ExpireAfter)
	require.Equal(t, 2, job.InsertOpts().MaxAttempts)
	require.Equal(t, 3, ArgsNotifyAdmin{}.InsertOpts().MaxAttempts)
	require.True(t, job.InsertOpts().UniqueOpts.ByArgs)
	require.Zero(t, job.InsertOpts().UniqueOpts.ByPeriod)
	// Even after the local window expires, retry evidence keeps the River key.
	now = now.Add(72 * time.Hour)
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 123, reportURL, zones[:1]))
	require.Equal(t, job.UniqueKey, queue.jobs[1].UniqueKey)
	require.Equal(t, job.ChannelID, queue.jobs[1].ChannelID)
	now = now.Add(72 * time.Hour)
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 124, reportURL, zones))
	require.NotEqual(t, job.UniqueKey, queue.jobs[2].UniqueKey)
	require.False(t, ArgsNotifyAdmin{}.InsertOpts().UniqueOpts.ByArgs)
}

func TestUnknownUnitNotificationOptionalAndErrors(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	queue := &unknownUnitQueue{err: errors.New("offline")}
	zones := []UnknownUnitZoneSummary{{Zone: "Zone", Entries: 1, GUIDs: 2}}
	require.ErrorIs(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 1, "", zones), queue.err)
	require.Len(t, queue.jobs, 1)
	require.Error(t, EnqueueUnknownUnitNotification(ctx, nil, bot, uuid.Nil, 1, "", zones))
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, nil, bot, uuid.Nil, 1, "", nil))
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, nil, bot, uuid.Nil, 1, "", []UnknownUnitZoneSummary{{Entries: 1}}))
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, nil, nil, uuid.Nil, 1, "", zones))
	for _, config := range []Config{{}, {Token: "test"}} {
		disabled, err := New(ctx, testutil.Logger(t), config)
		require.NoError(t, err)
		require.NoError(t, EnqueueUnknownUnitNotification(ctx, nil, disabled, uuid.Nil, 1, "", zones))
	}
}

func TestUnknownUnitNotificationBounds(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	zones := make([]UnknownUnitZoneSummary, 100)
	for i := range zones {
		zones[i] = UnknownUnitZoneSummary{Zone: fmt.Sprintf("%03d%s", i, strings.Repeat("界", 1000)), Entries: 123456, GUIDs: 1234567}
	}
	queue := &unknownUnitQueue{}
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 1, "", zones))
	require.Len(t, queue.jobs, 1)
	job := queue.jobs[0]
	require.LessOrEqual(t, len(job.Fields), 25)
	total := len(job.Title)
	for _, field := range job.Fields {
		require.LessOrEqual(t, len(field.Name), 256)
		require.LessOrEqual(t, len(field.Value), 1024)
		require.True(t, utf8.ValidString(field.Name))
		total += len(field.Name) + len(field.Value)
	}
	require.LessOrEqual(t, total, 6000)
	require.Contains(t, job.Fields[len(job.Fields)-1].Value, "80 more zones")
}

func TestUnknownUnitReportURL(t *testing.T) {
	t.Parallel()
	bot := &Bot{config: Config{AccessURL: "https://chronicle.example/", PrimaryDomain: "chronicle.example"}}
	logID := uuid.New()
	require.Equal(t, "https://chronicle.example/logs/"+logID.String(), bot.UnknownUnitReportURL(logID, pgtype.Text{}))
	require.Equal(t, "https://forever.chronicle.example/logs/"+logID.String(), bot.UnknownUnitReportURL(logID, pgtype.Text{String: "forever", Valid: true}))
}
