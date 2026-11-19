package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestUnknownUnitDebounceWindowAndIsolation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	bot.unknownUnitDebounce.now = func() time.Time { return now }
	queue := &unknownUnitQueue{}
	a := []UnknownUnitZoneSummary{{Zone: "A", Entries: 1, GUIDs: 2}}
	send := func(tenant uuid.UUID, zones []UnknownUnitZoneSummary) {
		t.Helper()
		require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, tenant, 1, "", zones))
	}
	send(uuid.Nil, a)
	send(uuid.Nil, a)
	require.Len(t, queue.jobs, 1)
	send(uuid.Nil, append(a, UnknownUnitZoneSummary{Zone: "B", Entries: 3, GUIDs: 5}))
	require.Len(t, queue.jobs, 2)
	require.Contains(t, queue.jobs[1].Fields[0].Value, "1 zones; 5 unknown GUIDs")
	require.Equal(t, "B", queue.jobs[1].Fields[1].Name)
	send(uuid.New(), a)
	require.Len(t, queue.jobs, 3)
	now = now.Add(72*time.Hour - time.Nanosecond)
	send(uuid.Nil, a)
	require.Len(t, queue.jobs, 3)
	now = now.Add(time.Nanosecond)
	send(uuid.Nil, a)
	require.Len(t, queue.jobs, 4)
	// Pruning expired entries leaves only this new reservation.
	require.Len(t, bot.unknownUnitDebounce.entries, 1)
}

func TestUnknownUnitDebounceEnqueueFailureReleases(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	queue := &unknownUnitQueue{err: errors.New("offline")}
	zones := []UnknownUnitZoneSummary{{Zone: "A", GUIDs: 1}}
	require.Error(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 1, "", zones))
	require.Empty(t, bot.unknownUnitDebounce.entries)
	queue.err = nil
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 1, "", zones))
	require.Len(t, queue.jobs, 2)
	require.NoError(t, EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 2, "", zones))
	require.Len(t, queue.jobs, 2)
}

type blockingUnknownUnitQueue struct {
	started chan struct{}
	release chan struct{}
}

func (q *blockingUnknownUnitQueue) Insert(ctx context.Context, _ river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.started <- struct{}{}
	select {
	case <-q.release:
		return nil, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func TestUnknownUnitDebounceConcurrentReservation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	bot, err := New(ctx, testutil.Logger(t), Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	queue := &blockingUnknownUnitQueue{started: make(chan struct{}, 20), release: make(chan struct{})}
	defer close(queue.release)
	zones := []UnknownUnitZoneSummary{{Zone: "A", GUIDs: 1}}
	firstDone := make(chan error, 1)
	go func() { firstDone <- EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 1, "", zones) }()
	select {
	case <-queue.started:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	errs := make(chan error, 10)
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- EnqueueUnknownUnitNotification(ctx, queue, bot, uuid.Nil, 2, "", zones)
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	require.Empty(t, queue.started)
	// Release the first insert while keeping cleanup safe on assertion failure.
	queue.release <- struct{}{}
	require.NoError(t, <-firstDone)
	require.Len(t, bot.unknownUnitDebounce.entries, 1)
}

func TestUnknownUnitDebounceCapacity(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	d := unknownUnitDebounce{now: func() time.Time { return now }}
	zones := make([]UnknownUnitZoneSummary, unknownUnitDebounceCapacity+1)
	for i := range zones {
		zones[i] = UnknownUnitZoneSummary{Zone: fmt.Sprint(i), GUIDs: 1}
	}
	selected, finish := d.reserve(uuid.Nil, zones)
	require.Len(t, selected, unknownUnitDebounceCapacity)
	finish(true)
	require.Len(t, d.entries, unknownUnitDebounceCapacity)
	now = now.Add(72 * time.Hour)
	selected, finish = d.reserve(uuid.Nil, zones[len(zones)-1:])
	require.Len(t, selected, 1)
	finish(true)
	require.Len(t, d.entries, 1)
}
