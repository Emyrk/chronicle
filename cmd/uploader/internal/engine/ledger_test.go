package engine_test

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
)

// logBody returns a combat log longer than the hashed prefix, so its source id
// is stable while it grows, plus whatever extra lines the caller appends.
func logBody(extra string) []byte {
	var b bytes.Buffer
	b.WriteString("1/1 20:00:00.000  COMBAT_LOG_VERSION,22\n")
	for b.Len() < upload.SourcePrefix+1024 {
		b.WriteString("1/1 20:00:01.000  SWING_DAMAGE,0xA,\"Thrall\",0x1,0xB,\"Boar\",0x2,42\n")
	}
	b.WriteString(extra)
	return b.Bytes()
}

// writeLog puts b in the watched log directory under name.
func writeLog(t *testing.T, h *harness, name string, b []byte) string {
	t.Helper()
	p := filepath.Join(filepath.Dir(h.logPath), name)
	require.NoError(t, os.WriteFile(p, b, 0o644))
	return p
}

func TestEngineSkipsSameLogAtANewPath(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	body := logBody("")
	require.NoError(t, os.WriteFile(h.logPath, body, 0o644))
	h.res = upload.Result{ReportURL: "https://x/logs/1"}
	t0 := time.Now()

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0, false)
	require.Equal(t, 1, h.uploads)
	require.Len(t, h.sources, 1)
	require.NotEmpty(t, h.sources[0], "the upload carried a source id")
	st := h.st.Get()
	require.Len(t, st.Logs, 1)
	require.Equal(t, int64(len(body)), st.Logs[h.sources[0]].Size)
	require.Equal(t, "https://x/logs/1", st.Logs[h.sources[0]].ReportURL)

	// The same bytes under another name: an archived log put back, or one
	// copied from another machine.
	copyPath := writeLog(t, h, "WoWCombatLog-copy.txt", body)
	id, err := upload.Identify(copyPath)
	require.NoError(t, err)
	require.Equal(t, h.sources[0], id)

	h.step(t, t0.Add(10*time.Second), true)
	require.Equal(t, 1, h.uploads, "the copy was sent again")
	require.NotContains(t, h.notified, "Chronicle upload failed")
	last := h.statuses[len(h.statuses)-1]
	require.Equal(t, engine.StateUploaded, last.State)
	require.Equal(t, "https://x/logs/1", last.ReportURL)
	require.Equal(t, "https://x/logs/1", h.st.Get().LastReportURL)
	// It is not queued again on the next poll either.
	h.step(t, t0.Add(20*time.Second), true)
	require.Equal(t, 1, h.uploads)
}

func TestEngineUploadsGrownLogOnceThenSkips(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	body := logBody("")
	require.NoError(t, os.WriteFile(h.logPath, body, 0o644))
	h.res = upload.Result{ReportURL: "https://x/logs/1"}
	t0 := time.Now()

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0, false)
	require.Equal(t, 1, h.uploads)

	// The same session with more fights in it, under a new name. The ledger
	// has the shorter size, so the whole file goes again under the same
	// source id and the server replaces the group it parsed.
	grown := logBody("1/1 21:00:00.000  SWING_DAMAGE,0xA,\"Thrall\",0x1,0xB,\"Boar\",0x2,99\n")
	writeLog(t, h, "WoWCombatLog-2.txt", grown)
	h.step(t, t0.Add(10*time.Second), true)
	require.Equal(t, 2, h.uploads)
	require.Equal(t, h.sources[0], h.sources[1], "a grown log keeps its source id")
	require.Equal(t, int64(len(grown)), h.st.Get().Logs[h.sources[1]].Size)

	// Those same grown bytes anywhere else are now on the server.
	writeLog(t, h, "WoWCombatLog-3.txt", grown)
	h.step(t, t0.Add(20*time.Second), true)
	require.Equal(t, 2, h.uploads)
}

func TestEngineSkipsWhatTheServerSaysItHas(t *testing.T) {
	t.Parallel()
	body := logBody("")
	// An empty ledger is what a fresh install, a second machine or a corrupt
	// state file leaves behind.
	h := newHarnessLookup(t, nil, nil, func(string) (upload.Have, error) {
		return upload.Have{Size: int64(len(body)), ReportURL: "https://x/logs/7"}, nil
	})
	require.NoError(t, os.WriteFile(h.logPath, body, 0o644))
	t0 := time.Now()

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0, false)
	require.Equal(t, 0, h.uploads, "the body was sent anyway")
	require.Equal(t, 1, h.lookups)
	st := h.st.Get()
	require.Equal(t, "https://x/logs/7", st.LastReportURL)
	require.Len(t, st.Logs, 1)
	last := h.statuses[len(h.statuses)-1]
	require.Equal(t, engine.StateUploaded, last.State)
	require.Equal(t, "https://x/logs/7", last.ReportURL)
	require.NotContains(t, h.notified, "Chronicle upload failed")

	// The answer is remembered, so the next log is not asked about twice.
	writeLog(t, h, "WoWCombatLog-copy.txt", body)
	h.step(t, t0.Add(10*time.Second), true)
	require.Equal(t, 0, h.uploads)
	require.Equal(t, 1, h.lookups)
}

func TestEngineUploadsWhenTheLookupFails(t *testing.T) {
	t.Parallel()
	h := newHarnessLookup(t, nil, nil, func(string) (upload.Have, error) {
		return upload.Have{}, errors.New("dial tcp: no route to host")
	})
	require.NoError(t, os.WriteFile(h.logPath, logBody(""), 0o644))
	h.res = upload.Result{ReportURL: "https://x/logs/1", Duplicate: true}
	t0 := time.Now()

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0, false)
	require.Equal(t, 1, h.uploads, "an unreachable server must not stop the upload")
	require.Equal(t, 1, h.lookups)
	require.Contains(t, h.notified, "Already uploaded")
	require.Equal(t, "https://x/logs/1", h.st.Get().LastReportURL)
}

func TestEngineUploadsWhenTheServerHasOnlyPartOfIt(t *testing.T) {
	t.Parallel()
	body := logBody("")
	h := newHarnessLookup(t, nil, nil, func(string) (upload.Have, error) {
		return upload.Have{Size: int64(len(body)) - 100, ReportURL: "https://x/logs/7"}, nil
	})
	require.NoError(t, os.WriteFile(h.logPath, body, 0o644))
	h.res = upload.Result{ReportURL: "https://x/logs/7"}
	t0 := time.Now()

	h.mu.Lock()
	h.running = false
	h.mu.Unlock()
	h.step(t, t0, false)
	require.Equal(t, 1, h.uploads)
	require.Equal(t, int64(len(body)), h.st.Get().Logs[h.sources[0]].Size)
}
