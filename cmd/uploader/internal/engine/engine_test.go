package engine_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

type harness struct {
	e       *engine.Engine
	st      *store.Store
	logPath string

	mu       sync.Mutex
	running  bool
	token    string
	results  []error // consumed one per Upload call
	res      upload.Result
	uploads  int
	fast     []bool        // the fast flag of each Upload call
	gate     chan struct{} // when set, Upload blocks until it is closed
	notified []string
	statuses []engine.Status
}

func newHarness(t testing.TB) *harness { return newHarnessToken(t, nil) }

// newHarnessToken replaces the keychain read when tokenFn is non-nil.
func newHarnessToken(t testing.TB, tokenFn func() string) *harness {
	t.Helper()
	dir := t.TempDir()
	logDir := filepath.Join(dir, "_x_", "Logs")
	require.NoError(t, os.MkdirAll(logDir, 0o755))
	h := &harness{logPath: filepath.Join(logDir, "WoWCombatLog.txt"), token: "tok", running: true}
	require.NoError(t, os.WriteFile(h.logPath, []byte("some combat"), 0o644))
	st, err := store.Open(filepath.Join(dir, "state.json"))
	require.NoError(t, err)
	h.st = st
	h.e = engine.New(engine.Config{
		Store:    st,
		Installs: func() []wowdir.Install { return []wowdir.Install{{Dir: filepath.Dir(logDir), LogDir: logDir}} },
		Token: func() string {
			if tokenFn != nil {
				return tokenFn()
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			return h.token
		},
		Upload: func(_ context.Context, _, _ string, _ int64, fast bool) (upload.Result, error) {
			h.mu.Lock()
			h.uploads++
			h.fast = append(h.fast, fast)
			gate := h.gate
			var err error
			if len(h.results) > 0 {
				err = h.results[0]
				h.results = h.results[1:]
			}
			res := h.res
			h.mu.Unlock()
			if gate != nil {
				<-gate
			}
			return res, err
		},
		Running:   func(context.Context, []string) bool { h.mu.Lock(); defer h.mu.Unlock(); return h.running },
		Notify:    func(title, _ string) { h.notified = append(h.notified, title) },
		OnStatus:  func(s engine.Status) { h.statuses = append(h.statuses, s) },
		RetryBase: time.Millisecond,
		RetryMax:  time.Millisecond,
		// Five 1 ms waits, so a 5xx loop makes six attempts.
		ServerRetryFor: 5 * time.Millisecond,
	})
	return h
}

// step polls and then waits for the upload worker to finish what was queued.
func (h *harness) step(t *testing.T, now time.Time, manual bool) {
	t.Helper()
	h.e.Step(context.Background(), now, manual)
	require.Eventually(t, func() bool { return !h.e.Busy() }, 5*time.Second, time.Millisecond)
}

func TestEngineUploadsOnWoWExit(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.res = upload.Result{ReportURL: "https://x/logs/1"}
	t0 := time.Now()

	h.step(t, t0, false)
	require.Equal(t, 0, h.uploads)
	require.Equal(t, engine.StateNoLog, h.statuses[len(h.statuses)-1].State)

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0.Add(5*time.Second), false)
	require.Equal(t, 1, h.uploads)
	last := h.statuses[len(h.statuses)-1]
	require.Equal(t, engine.StateUploaded, last.State)
	require.Equal(t, "https://x/logs/1", last.ReportURL)
	require.Equal(t, []string{"Log uploaded"}, h.notified)
	require.Equal(t, int64(len("some combat")), h.st.Get().Uploaded[h.logPath])

	// Nothing more to send.
	h.step(t, t0.Add(10*time.Second), false)
	require.Equal(t, 1, h.uploads)
}

func TestEngineRetriesOfflineThenSucceeds(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.results = []error{errors.New("dial tcp: no route to host"), errors.New("dial tcp: no route to host"), nil}

	h.step(t, time.Now(), false)
	require.Equal(t, 3, h.uploads)
	require.Equal(t, engine.StateUploaded, h.statuses[len(h.statuses)-1].State)
}

func TestEngineDuplicate(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.res = upload.Result{Duplicate: true, ReportURL: "https://x/logs/file/abc"}

	h.step(t, time.Now(), false)
	require.Equal(t, []string{"Already uploaded"}, h.notified)
}

func TestEngineReconnect(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.token = ""
	t0 := time.Now()

	h.step(t, t0, false)
	require.Equal(t, 0, h.uploads)
	require.Equal(t, engine.StateReconnect, h.statuses[len(h.statuses)-1].State)

	// Signing in uploads the log that was waiting.
	h.token = "fresh"
	h.e.TokenChanged()
	h.step(t, t0.Add(5*time.Second), false)
	require.Equal(t, 1, h.uploads)
	require.Equal(t, engine.StateUploaded, h.statuses[len(h.statuses)-1].State)
}

func TestEngineRejectedToken(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.results = []error{upload.ErrUnauthorized}
	t0 := time.Now()

	h.step(t, t0, false)
	// The worker wakes the poll loop, which shows the reconnect state.
	h.step(t, t0.Add(5*time.Second), false)
	require.Equal(t, engine.StateReconnect, h.statuses[len(h.statuses)-1].State)
	require.Contains(t, h.statuses[len(h.statuses)-1].Detail, "Needs reconnect")
	h.step(t, t0.Add(10*time.Second), false)
	require.Equal(t, 1, h.uploads) // not hammered while the token is unchanged
}

func TestEngineTokenCached(t *testing.T) {
	t.Parallel()
	reads := 0
	h := newHarnessToken(t, func() string { reads++; return "tok" })
	h.running = false
	t0 := time.Now()

	for i := 0; i < 100; i++ {
		h.step(t, t0.Add(time.Duration(i)*5*time.Second), false)
	}
	require.Equal(t, 1, reads)

	h.e.TokenChanged()
	h.step(t, t0.Add(time.Hour), false)
	require.Equal(t, 2, reads)
}

func TestEngineGivesUpOnServerErrors(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	unavailable := &upload.Error{Status: 503, Message: "Service Unavailable"}
	for i := 0; i < 20; i++ {
		h.results = append(h.results, unavailable)
	}
	require.NoError(t, h.st.Update(func(s *store.State) { s.UploadOnIdle = true }))
	t0 := time.Now()

	h.step(t, t0, false)
	require.Equal(t, 6, h.uploads)
	require.Equal(t, []string{"Chronicle upload failed"}, h.notified)

	// Failed for this size: nothing is sent until the log changes.
	h.step(t, t0.Add(10*time.Minute), false)
	require.Equal(t, 6, h.uploads)

	h.results = nil
	require.NoError(t, os.WriteFile(h.logPath, []byte("some combat and more"), 0o644))
	h.step(t, t0.Add(20*time.Minute), false) // sees the growth
	h.step(t, t0.Add(30*time.Minute), false) // idle for longer than IdleAfter
	require.Equal(t, 7, h.uploads)
}

func TestEngineStepDoesNotWaitForUpload(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.gate = make(chan struct{})
	ctx := context.Background()
	t0 := time.Now()

	h.e.Step(ctx, t0, false)
	h.e.Step(ctx, t0.Add(time.Second), true) // Upload now while WoW runs; blocks in Upload
	require.Eventually(t, func() bool { h.mu.Lock(); defer h.mu.Unlock(); return h.uploads == 1 }, 5*time.Second, time.Millisecond)

	// The poll loop keeps going: WoW exits and the session is noticed, and
	// repeated polls do not queue the same log again.
	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.e.Step(ctx, t0.Add(10*time.Minute), false)
	h.e.Step(ctx, t0.Add(10*time.Minute+5*time.Second), true)
	close(h.gate)
	require.Eventually(t, func() bool { return !h.e.Busy() }, 5*time.Second, time.Millisecond)

	require.Equal(t, 1, h.uploads)
	require.Equal(t, []bool{true}, h.fast) // the game was running
	last := h.statuses[len(h.statuses)-1]
	require.Equal(t, engine.StateUploaded, last.State)
	require.Equal(t, "Your 10m session is on Chronicle.", last.Detail)
}

func TestEngineArchivesAfterExitUpload(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	t0 := time.Now()
	dir := filepath.Dir(h.logPath)

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0, false)
	require.Equal(t, 1, h.uploads)
	require.FileExists(t, h.logPath) // archived from the next poll, not inline

	h.mu.Lock()
	h.running = true // the game came back before that poll
	h.mu.Unlock()
	h.step(t, t0.Add(5*time.Second), false)
	require.FileExists(t, h.logPath)

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0.Add(10*time.Second), false)
	require.NoFileExists(t, h.logPath)
	archives, err := filepath.Glob(filepath.Join(dir, "WoWCombatLog-uploaded-*.txt"))
	require.NoError(t, err)
	require.Len(t, archives, 1)
	require.Equal(t, int64(len("some combat")), h.st.Get().Uploaded[archives[0]])
	require.NotContains(t, h.st.Get().Uploaded, h.logPath)

	// The next session's log is uploaded on its own; the archive is not re-sent.
	require.NoError(t, os.WriteFile(h.logPath, []byte("next"), 0o644))
	h.mu.Lock()
	h.running = true
	h.mu.Unlock()
	h.step(t, t0.Add(15*time.Second), false)
	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0.Add(20*time.Second), false)
	require.Equal(t, 2, h.uploads)
}

func TestEngineKeepLog(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	require.NoError(t, h.st.Update(func(s *store.State) { s.KeepLog = true }))
	t0 := time.Now()

	h.step(t, t0, false)
	h.step(t, t0.Add(5*time.Second), false)
	require.Equal(t, 1, h.uploads)
	require.FileExists(t, h.logPath)
}
