package chronicle

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type unknownReportQueue struct {
	jobs []chroniclebot.ArgsNotifyAdmin
}

func (q *unknownReportQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.jobs = append(q.jobs, args.(chroniclebot.ArgsNotifyUnknownUnits).Notification)
	return nil, nil
}

func TestUnknownUnitsAcrossInstancesOneNotification(t *testing.T) {
	t.Parallel()
	reports := []chroniclesdk.InstanceReport{
		{Name: "First", Zone: "Zone A", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{42: {Count: 2}, 43: {Count: 3}}},
		{Name: "Second", Zone: "Zone A", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{42: {Count: 4}}},
		{Name: "Third", Zone: "Zone B", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{0: {Count: 1}, 42: {Count: 1}}},
		{Name: "Empty"},
	}
	zones := unknownUnitZoneSummaries(reports)
	require.ElementsMatch(t, []chroniclebot.UnknownUnitZoneSummary{{Zone: "Zone A", Entries: 2, GUIDs: 9}, {Zone: "Zone B", Entries: 1, GUIDs: 1}}, zones)
	bot, err := chroniclebot.New(context.Background(), testutil.Logger(t), chroniclebot.Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	queue := &unknownReportQueue{}
	require.NoError(t, chroniclebot.EnqueueUnknownUnitNotification(context.Background(), queue, bot, uuid.Nil, 42, "https://chronicle.example/logs/test", zones))
	require.Len(t, queue.jobs, 1)
	require.Contains(t, queue.jobs[0].Fields[0].Value, "2 zones; 10 unknown GUIDs")
}

func TestUnknownUnitsNotificationOptionalAndBestEffort(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	reports := []chroniclesdk.InstanceReport{{Name: "Zone", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{42: {Name: "Unknown summon", Count: 1}}}}
	worker := &WorkerLogParse{parent: &Chronicle{}}
	require.NotPanics(t, func() { worker.notifyUnknownUnits(ctx, uuid.Nil, uuid.New(), 42, reports) })
	bot, err := chroniclebot.New(ctx, testutil.Logger(t), chroniclebot.Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	worker.bot = bot
	// No queue is logged but cannot fail the parse.
	require.NotPanics(t, func() { worker.notifyUnknownUnits(ctx, uuid.Nil, uuid.New(), 42, reports) })
	require.Empty(t, unknownUnitZoneSummaries(nil))
	require.Empty(t, unknownUnitZoneSummaries([]chroniclesdk.InstanceReport{{UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{42: {Count: 0}}}}))
}

func TestUnknownUnitsHanAlertsPreserveReports(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	bot, err := chroniclebot.New(ctx, testutil.Logger(t), chroniclebot.Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	reports := []chroniclesdk.InstanceReport{
		{Zone: "祖尔法拉克", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{42: {Name: "未知单位", Count: 2}}},
		// A missing zone uses the instance name, so that fallback is filtered too.
		{Name: "熔火之心", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{43: {Count: 3}}},
		{Zone: "Höhle", UnknownUnits: map[uint32]chroniclesdk.UnknownUnit{44: {Name: "Unknown summon", Count: 4}}},
	}
	zones := unknownUnitZoneSummaries(reports)
	require.Len(t, zones, 3)
	queue := &unknownReportQueue{}
	require.NoError(t, chroniclebot.EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 42, "", zones))
	require.Len(t, queue.jobs, 1)
	require.Len(t, queue.jobs[0].Fields, 2)
	require.Equal(t, "Höhle", queue.jobs[0].Fields[1].Name)
	require.Contains(t, queue.jobs[0].Fields[0].Value, "1 zones; 4 unknown GUIDs")
	// Notification suppression neither removes unknowns nor changes summaries.
	require.ElementsMatch(t, zones, unknownUnitZoneSummaries(reports))
	require.Equal(t, chroniclesdk.UnknownUnit{Name: "未知单位", Count: 2}, reports[0].UnknownUnits[42])
}
