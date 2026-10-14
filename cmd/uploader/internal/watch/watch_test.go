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
	for _, n := range []string{"WoWCombatLog.txt", "WoWCombatLog-101525_120000.txt", "WoWChatLog.txt", "other.txt", "WoWCombatLog-uploaded-20260101-210000.txt"} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, n), []byte("x"), 0o644))
	}
	got := watch.LogFiles([]string{dir, filepath.Join(dir, "missing")})
	require.Len(t, got, 2) // archives (-uploaded-) are ignored
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

func TestTrackerArchive(t *testing.T) {
	t.Parallel()
	t0 := time.Date(2026, 1, 1, 20, 0, 0, 0, time.UTC)
	exitOnly := watch.Trigger{OnExit: true, IdleAfter: 5 * time.Minute}
	live := func(size int64) []watch.File {
		return []watch.File{{Path: filepath.Join("Logs", watch.LiveLogName), Size: size}}
	}
	uploaded := func(t *testing.T, size int64) *watch.Tracker {
		tr := watch.NewTracker(nil)
		up, _ := tr.Observe(t0, live(size), false, false, exitOnly)
		require.Len(t, up, 1)
		tr.MarkUploaded(up[0].Path, size)
		return tr
	}

	t.Run("archived once uploaded and WoW is not running", func(t *testing.T) {
		t.Parallel()
		tr := uploaded(t, 100)
		require.Equal(t, live(100), tr.Archivable(live(100), false))
	})

	t.Run("deferred while WoW is running", func(t *testing.T) {
		t.Parallel()
		tr := uploaded(t, 100)
		require.Empty(t, tr.Archivable(live(100), true))
		require.Len(t, tr.Archivable(live(100), false), 1) // the next not-running poll
	})

	t.Run("not archived with unuploaded bytes or before upload", func(t *testing.T) {
		t.Parallel()
		tr := uploaded(t, 100)
		require.Empty(t, tr.Archivable(live(150), false))
		fresh := watch.NewTracker(nil)
		fresh.Observe(t0, live(100), true, false, exitOnly)
		require.Empty(t, fresh.Archivable(live(100), false))
	})

	t.Run("renamed log is not re-queued and a new log starts fresh", func(t *testing.T) {
		t.Parallel()
		tr := uploaded(t, 100)
		to := filepath.Join("Logs", "WoWCombatLog-uploaded-20260101-210000.txt")
		tr.MarkArchived(live(100)[0].Path, to)
		files := append(live(10), watch.File{Path: to, Size: 100})
		up, _ := tr.Observe(t0.Add(time.Minute), files, false, true, exitOnly)
		require.Empty(t, tr.Archivable([]watch.File{{Path: to, Size: 100}}, false)) // archives are not archived again
		require.Equal(t, live(10), up)                                              // only the new log
	})
}

func TestArchive(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, watch.LiveLogName)
	require.NoError(t, os.WriteFile(path, []byte("12345"), 0o644))
	now := time.Date(2026, 1, 1, 21, 0, 0, 0, time.UTC)

	_, err := watch.Archive(watch.File{Path: path, Size: 3}, now)
	require.Error(t, err) // grew since it was uploaded
	require.FileExists(t, path)

	to, err := watch.Archive(watch.File{Path: path, Size: 5}, now)
	require.NoError(t, err)
	require.Equal(t, filepath.Join(dir, "WoWCombatLog-uploaded-20260101-210000.txt"), to)
	require.FileExists(t, to)
	require.NoFileExists(t, path)
}

// The log is appended to by another process that keeps it open; polling must
// see the new size each time (on Windows this needs a handle-based stat).
func TestLogFilesSeesGrowth(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	f, err := os.Create(filepath.Join(dir, "WoWCombatLog.txt"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = f.Close() })
	total := 0
	for _, n := range []int{5, 7, 100} {
		_, err = f.Write(make([]byte, n))
		require.NoError(t, err)
		total += n
		files := watch.LogFiles([]string{dir})
		require.Len(t, files, 1)
		require.EqualValues(t, total, files[0].Size)
	}
}
