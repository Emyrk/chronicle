package chroniclebot

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type unknownUnitQueue struct {
	jobs []ArgsNotifyAdmin
	err  error
}

func (q *unknownUnitQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.jobs = append(q.jobs, args.(ArgsNotifyAdmin))
	return nil, q.err
}

func TestUnknownUnitNotifications(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	instance := UnknownUnitNotificationContext{TenantID: uuid.New(), Zone: " Test zone ", InstanceURL: "https://chronicle.example/instances/test"}
	first := guid.GUID(0xF130000000000001 | uint64(42)<<24)
	second := first + 1
	units := map[uint32]UnknownUnitCategory{
		0x1000000: {Count: 1}, 100: {Count: 0},
		42: {Name: "Mystery", Count: 20, Samples: []guid.GUID{second, first, first, first + 1<<24, 0}},
		43: {Count: 1},
	}
	queue := &unknownUnitQueue{}
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, queue, bot, instance, units))
	require.Len(t, queue.jobs, 2)
	job := queue.jobs[0]
	require.Equal(t, "Unknown unit category", job.Title)
	require.Equal(t, instance.InstanceURL, job.URL)
	require.Equal(t, "admins", job.ChannelID)
	require.Equal(t, []AdminNotificationField{
		{Name: "Zone", Value: "Test zone", Inline: true},
		{Name: "Entry ID", Value: "42", Inline: true},
		{Name: "Name", Value: "Mystery"},
		{Name: "Unique observed GUIDs", Value: "20", Inline: true},
		{Name: "Sample GUIDs", Value: first.String() + "\n" + second.String()},
	}, job.Fields)
	require.Equal(t, "Unknown", queue.jobs[1].Fields[2].Value)
	require.True(t, job.InsertOpts().UniqueOpts.ByArgs)
	require.Equal(t, 24*time.Hour, job.InsertOpts().UniqueOpts.ByPeriod)
	require.NotEqual(t, job.UniqueKey, queue.jobs[1].UniqueKey)
	// Neither instance identity nor changing observations are part of dedup.
	instance.InstanceURL += "-another"
	units[42] = UnknownUnitCategory{Name: "Renamed", Count: 1}
	queue.jobs = nil
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, queue, bot, instance, units))
	require.Equal(t, job.UniqueKey, queue.jobs[0].UniqueKey)
	instance.Zone = "Another zone"
	queue.jobs = nil
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, queue, bot, instance, units))
	require.NotEqual(t, job.UniqueKey, queue.jobs[0].UniqueKey)
	// Failures remain available for best-effort caller logging and do not prevent
	// the remaining categories from being attempted.
	queue.err = errors.New("offline")
	queue.jobs = nil
	require.ErrorIs(t, EnqueueUnknownUnitNotifications(ctx, queue, bot, instance, units), queue.err)
	require.Len(t, queue.jobs, 2)
	require.Error(t, EnqueueUnknownUnitNotifications(ctx, nil, bot, instance, units))
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, nil, nil, instance, units))
	for _, config := range []Config{{}, {Token: "test"}} {
		disabled, err := New(ctx, testutil.Logger(t), config)
		require.NoError(t, err)
		require.NoError(t, EnqueueUnknownUnitNotifications(ctx, nil, disabled, instance, units))
	}
	instance.Zone = " "
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, nil, bot, instance, units))
	require.False(t, ArgsNotifyAdmin{}.InsertOpts().UniqueOpts.ByArgs)
}

func TestUnknownUnitNotificationBounds(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	samples := make([]guid.GUID, 20)
	for i := range samples {
		samples[i] = guid.GUID(0xF13000002A000001 + uint64(i))
	}
	queue := &unknownUnitQueue{}
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, queue, bot, UnknownUnitNotificationContext{Zone: strings.Repeat("界", 1000)}, map[uint32]UnknownUnitCategory{
		42: {Name: strings.Repeat("界", 1000), Count: 20, Samples: samples},
	}))
	require.Len(t, queue.jobs, 1)
	for _, field := range queue.jobs[0].Fields {
		require.LessOrEqual(t, len(field.Value), 1024)
	}
	require.Len(t, strings.Split(queue.jobs[0].Fields[4].Value, "\n"), 5)
}

func TestUnknownUnitNotificationsWithoutMeaningfulEntry(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	queue := &unknownUnitQueue{}
	noEntry := guid.GUID(0xF160000000000001)
	zeroEntry := guid.GUID(0xF130000000000001)
	units := map[uint32]UnknownUnitCategory{0: {Count: 2, Samples: []guid.GUID{noEntry, zeroEntry, 0}}}
	require.NoError(t, EnqueueUnknownUnitNotifications(ctx, queue, bot, UnknownUnitNotificationContext{Zone: "Test zone", InstanceURL: "https://chronicle.example/instances/test"}, units))
	require.Len(t, queue.jobs, 1)
	require.Contains(t, queue.jobs[0].Fields[1].Value, "No meaningful entry ID")
	require.Equal(t, "2", queue.jobs[0].Fields[3].Value)
	require.Contains(t, queue.jobs[0].Fields[4].Value, noEntry.String())
	require.Contains(t, queue.jobs[0].Fields[4].Value, zeroEntry.String())
	require.NotContains(t, queue.jobs[0].Fields[4].Value, guid.GUID(0).String())
	require.Equal(t, 24*time.Hour, queue.jobs[0].InsertOpts().UniqueOpts.ByPeriod)
}
