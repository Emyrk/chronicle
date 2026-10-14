package watch_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
)

type fakeProcs struct {
	table  []watch.Process
	lists  int
	exists int
}

func (f *fakeProcs) List(context.Context) ([]watch.Process, error) {
	f.lists++
	return f.table, nil
}

func (f *fakeProcs) Exe(context.Context, int32) (string, error) { return "", nil }

func (f *fakeProcs) Exists(_ context.Context, pid int32) (bool, error) {
	f.exists++
	for _, p := range f.table {
		if p.PID == pid {
			return true, nil
		}
	}
	return false, nil
}

var wowProc = watch.Process{PID: 42, Name: "WowClassic.exe"}

func TestGameEnumeratesOnlyWithoutKnownPid(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fp := &fakeProcs{table: []watch.Process{{PID: 1, Name: "launchd"}, wowProc}}
	g := watch.NewGame(tenant.DefaultLayout, fp)

	require.True(t, g.Running(ctx, nil))
	require.Equal(t, 1, fp.lists, "first sight enumerates once")

	for range 5 {
		require.True(t, g.Running(ctx, nil))
	}
	require.Equal(t, 1, fp.lists, "a live pid is polled, not enumerated")
	require.Equal(t, 5, fp.exists)

	fp.table = fp.table[:1] // the game dies
	require.True(t, g.Running(ctx, nil), "first miss is debounced")
	require.Equal(t, 2, fp.lists, "a dead pid triggers one enumeration")
	require.False(t, g.Running(ctx, nil), "second miss is an exit")
}

// A single missed poll must not look like WoW exiting.
func TestTrackerIgnoresTransientMiss(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	t0 := time.Date(2026, 1, 1, 20, 0, 0, 0, time.UTC)
	trig := watch.Trigger{OnExit: true, IdleAfter: 5 * time.Minute}
	files := []watch.File{{Path: "log", Size: 100}}
	fp := &fakeProcs{table: []watch.Process{wowProc}}
	g := watch.NewGame(tenant.DefaultLayout, fp)
	tr := watch.NewTracker(nil)
	poll := func(i int) []watch.File {
		up, _ := tr.Observe(t0.Add(time.Duration(i)*5*time.Second), files, g.Running(ctx, nil), false, trig)
		return up
	}

	require.Empty(t, poll(0))
	fp.table = nil
	require.Empty(t, poll(1), "one miss")
	fp.table = []watch.Process{wowProc} // the game is visible again
	require.Empty(t, poll(2))
	require.Empty(t, poll(3))

	fp.table = nil
	require.Empty(t, poll(4))
	require.Equal(t, files, poll(5), "two misses in a row exit")
}

func TestTrackerQueuesRotatedLogsOnce(t *testing.T) {
	t.Parallel()
	t0 := time.Date(2026, 1, 1, 20, 0, 0, 0, time.UTC)
	trig := watch.Trigger{OnExit: true, IdleAfter: 5 * time.Minute}
	oldLog := watch.File{Path: "WoWCombatLog-1.txt", Size: 100}
	newLog := watch.File{Path: "WoWCombatLog-2.txt", Size: 50}
	tr := watch.NewTracker(nil)

	tr.Observe(t0, []watch.File{oldLog}, true, false, trig)
	oldLog.Size = 120
	tr.Observe(t0.Add(time.Minute), []watch.File{oldLog}, true, false, trig)
	// The old file stops growing and a new one appears mid-session.
	up, rec := tr.Observe(t0.Add(2*time.Minute), []watch.File{oldLog, newLog}, true, false, trig)
	require.Empty(t, up)
	require.True(t, rec)

	both := []watch.File{oldLog, newLog}
	up, _ = tr.Observe(t0.Add(3*time.Minute), both, false, false, trig)
	require.Equal(t, both, up)

	for _, f := range up {
		tr.MarkUploaded(f.Path, f.Size)
	}
	up, _ = tr.Observe(t0.Add(4*time.Minute), both, false, false, trig)
	require.Empty(t, up)
}

// BenchmarkGameRunning is one engine tick of detection while the game runs.
// It starts a real process named Wow.exe, so the table being polled is the
// machine's.
func BenchmarkGameRunning(b *testing.B) {
	sleep, err := exec.LookPath("sleep")
	if err != nil {
		b.Skip("no sleep binary")
	}
	exe := filepath.Join(b.TempDir(), "Wow.exe")
	data, err := os.ReadFile(sleep)
	require.NoError(b, err)
	require.NoError(b, os.WriteFile(exe, data, 0o755))
	cmd := exec.Command(exe, "600")
	require.NoError(b, cmd.Start())
	b.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })

	ctx := context.Background()
	g := watch.NewGame(tenant.DefaultLayout, nil)
	require.True(b, g.Running(ctx, nil))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		g.Running(ctx, nil)
	}
}
