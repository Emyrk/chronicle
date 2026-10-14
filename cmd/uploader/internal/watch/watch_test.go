package watch_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
)

func TestLogFiles(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	for _, n := range []string{"WoWCombatLog.txt", "WoWCombatLog-101525_120000.txt", "WoWChatLog.txt", "other.txt"} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, n), []byte("x"), 0o644))
	}
	got := watch.LogFiles([]string{dir, filepath.Join(dir, "missing")})
	require.Len(t, got, 2)
	require.Equal(t, int64(1), got[0].Size)
}

func TestTracker(t *testing.T) {
	t.Parallel()
	const idle = 5 * time.Minute
	t0 := time.Date(2026, 1, 1, 20, 0, 0, 0, time.UTC)
	log := func(size int64) []watch.File { return []watch.File{{Path: "log", Size: size}} }
	exitOnly := watch.Trigger{OnExit: true, IdleAfter: idle}
	withIdle := watch.Trigger{OnExit: true, OnIdle: true, IdleAfter: idle}

	t.Run("exit only uploads once WoW is gone", func(t *testing.T) {
		t.Parallel()
		tr := watch.NewTracker(nil)
		up, rec := tr.Observe(t0, log(100), true, false, exitOnly)
		require.Empty(t, up) // first sight of a file while WoW runs: not an exit
		require.False(t, rec)

		up, rec = tr.Observe(t0.Add(time.Minute), log(200), true, false, exitOnly)
		require.Empty(t, up)
		require.True(t, rec)

		// Quiet for an hour: still nothing, the idle trigger is off.
		up, _ = tr.Observe(t0.Add(time.Hour), log(200), true, false, exitOnly)
		require.Empty(t, up)

		up, _ = tr.Observe(t0.Add(time.Hour+5*time.Second), log(200), false, false, exitOnly)
		require.Equal(t, log(200), up)

		tr.MarkUploaded("log", 200)
		up, _ = tr.Observe(t0.Add(time.Hour+10*time.Second), log(200), false, false, exitOnly)
		require.Empty(t, up)
	})

	t.Run("idle trigger", func(t *testing.T) {
		t.Parallel()
		tr := watch.NewTracker(nil)
		tr.Observe(t0, nil, true, false, withIdle)
		tr.Observe(t0, log(100), true, false, withIdle) // appears while running
		up, rec := tr.Observe(t0.Add(4*time.Minute), log(100), true, false, withIdle)
		require.Empty(t, up)
		require.True(t, rec)
		up, rec = tr.Observe(t0.Add(5*time.Minute), log(100), true, false, withIdle)
		require.Equal(t, log(100), up)
		require.False(t, rec)
	})

	t.Run("leftover log is uploaded at startup", func(t *testing.T) {
		t.Parallel()
		tr := watch.NewTracker(nil)
		up, _ := tr.Observe(t0, log(100), false, false, exitOnly)
		require.Equal(t, log(100), up)
	})

	t.Run("already uploaded log is skipped across restarts", func(t *testing.T) {
		t.Parallel()
		tr := watch.NewTracker(map[string]int64{"log": 100})
		up, _ := tr.Observe(t0, log(100), false, false, exitOnly)
		require.Empty(t, up)
		// The log grew after the last upload.
		up, _ = tr.Observe(t0.Add(time.Second), log(150), false, false, exitOnly)
		require.Empty(t, up) // growth alone is not an exit
		up, _ = tr.Observe(t0.Add(2*time.Second), log(150), false, true, exitOnly)
		require.Equal(t, log(150), up)
	})

	t.Run("queued file survives until marked", func(t *testing.T) {
		t.Parallel()
		tr := watch.NewTracker(nil)
		up, _ := tr.Observe(t0, log(100), false, false, exitOnly)
		require.Len(t, up, 1)
		up, _ = tr.Observe(t0.Add(time.Minute), log(100), false, false, exitOnly)
		require.Len(t, up, 1) // e.g. signed out: still waiting
	})

	t.Run("permanent failure is not retried until the log changes", func(t *testing.T) {
		t.Parallel()
		tr := watch.NewTracker(nil)
		tr.Observe(t0, log(100), false, false, exitOnly)
		tr.MarkFailed("log", 100)
		up, _ := tr.Observe(t0.Add(time.Minute), log(100), false, false, exitOnly)
		require.Empty(t, up)
		up, _ = tr.Observe(t0.Add(2*time.Minute), log(100), false, true, exitOnly)
		require.Len(t, up, 1) // manual still works
	})
}
