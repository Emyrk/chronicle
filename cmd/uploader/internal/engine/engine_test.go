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
	notified []string
	statuses []engine.Status
}

func newHarness(t *testing.T) *harness {
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
		Token:    func() string { h.mu.Lock(); defer h.mu.Unlock(); return h.token },
		Upload: func(context.Context, string, string, int64) (upload.Result, error) {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.uploads++
			if len(h.results) > 0 {
				err := h.results[0]
				h.results = h.results[1:]
				if err != nil {
					return upload.Result{}, err
				}
			}
			return h.res, nil
		},
		Running:   func(context.Context, []string) bool { h.mu.Lock(); defer h.mu.Unlock(); return h.running },
		Notify:    func(title, _ string) { h.notified = append(h.notified, title) },
		OnStatus:  func(s engine.Status) { h.statuses = append(h.statuses, s) },
		RetryBase: time.Millisecond,
		RetryMax:  time.Millisecond,
	})
	return h
}

func TestEngineUploadsOnWoWExit(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.res = upload.Result{ReportURL: "https://x/logs/1"}
	ctx := context.Background()
	t0 := time.Now()

	h.e.Step(ctx, t0, false)
	require.Equal(t, 0, h.uploads)
	require.Equal(t, engine.StateNoLog, h.statuses[len(h.statuses)-1].State)

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.e.Step(ctx, t0.Add(5*time.Second), false)
	require.Equal(t, 1, h.uploads)
	last := h.statuses[len(h.statuses)-1]
	require.Equal(t, engine.StateUploaded, last.State)
	require.Equal(t, "https://x/logs/1", last.ReportURL)
	require.Equal(t, []string{"Log uploaded"}, h.notified)
	require.Equal(t, int64(len("some combat")), h.st.Get().Uploaded[h.logPath])

	// Nothing more to send.
	h.e.Step(ctx, t0.Add(10*time.Second), false)
	require.Equal(t, 1, h.uploads)
}

func TestEngineRetriesOfflineThenSucceeds(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.results = []error{errors.New("dial tcp: no route to host"), errors.New("dial tcp: no route to host"), nil}

	h.e.Step(context.Background(), time.Now(), false)
	require.Equal(t, 3, h.uploads)
	require.Equal(t, engine.StateUploaded, h.statuses[len(h.statuses)-1].State)
}

func TestEngineDuplicate(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.res = upload.Result{Duplicate: true, ReportURL: "https://x/logs/file/abc"}

	h.e.Step(context.Background(), time.Now(), false)
	require.Equal(t, []string{"Already uploaded"}, h.notified)
}

func TestEngineReconnect(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.token = ""
	ctx := context.Background()
	t0 := time.Now()

	h.e.Step(ctx, t0, false)
	require.Equal(t, 0, h.uploads)
	require.Equal(t, engine.StateReconnect, h.statuses[len(h.statuses)-1].State)

	// Signing in uploads the log that was waiting.
	h.token = "fresh"
	h.e.Step(ctx, t0.Add(5*time.Second), false)
	require.Equal(t, 1, h.uploads)
	require.Equal(t, engine.StateUploaded, h.statuses[len(h.statuses)-1].State)
}

func TestEngineRejectedToken(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.running = false
	h.results = []error{upload.ErrUnauthorized}
	ctx := context.Background()
	t0 := time.Now()

	h.e.Step(ctx, t0, false)
	require.Equal(t, engine.StateReconnect, h.statuses[len(h.statuses)-1].State)
	h.e.Step(ctx, t0.Add(5*time.Second), false)
	require.Equal(t, 1, h.uploads) // not hammered while the token is unchanged
}
