package chronicle

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

// This proves the library boundary, not worker selection or storage publication.
// Each command runs this exact test executable with newly constructed dependencies.
func TestCompleteSessionSubprocessContinuation(t *testing.T) {
	t.Parallel()
	requireCheckpointSubprocessPlatform(t)
	for _, identity := range []string{"encounters", "identity"} {
		t.Run(identity, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			runCheckpointSubprocess(t, dir, "baseline-prefix", identity)
			runCheckpointSubprocess(t, dir, "baseline-future", identity)
			runCheckpointSubprocess(t, dir, "capture", identity)
			saved := readCheckpointSubprocessFile(t, dir, "checkpoint.json")
			// Capture has exited. Neither restore may reopen the historical input.
			require.NoError(t, os.Remove(filepath.Join(dir, "historical.log")))
			runCheckpointSubprocess(t, dir, "restore-prefix", identity)
			runCheckpointSubprocess(t, dir, "restore-future", identity)
			prefix := readCheckpointSubprocessFile(t, dir, "baseline-prefix.json")
			future := readCheckpointSubprocessFile(t, dir, "baseline-future.json")
			require.NotEqual(t, string(prefix), string(future), "future damage/death must affect the oracle")
			for _, suffix := range []string{"prefix", "future"} {
				want := readCheckpointSubprocessFile(t, dir, "baseline-"+suffix+".json")
				got := readCheckpointSubprocessFile(t, dir, "restore-"+suffix+".json")
				require.Equal(t, string(want), string(got))
				require.Equal(t, sha256.Sum256(want), sha256.Sum256(got))
			}
			require.Equal(t, saved, readCheckpointSubprocessFile(t, dir, "checkpoint.json"))
		})
	}
}

// A different valid asserted digest tests compatibility rejection, not a second
// compiled build. Never mutate the executable while another process runs it.
func TestCompleteSessionSubprocessRejectsIncompatibleIdentity(t *testing.T) {
	t.Parallel()
	requireCheckpointSubprocessPlatform(t)
	dir := t.TempDir()
	runCheckpointSubprocess(t, dir, "capture", "encounters")
	require.NoError(t, os.Remove(filepath.Join(dir, "historical.log")))
	for _, mode := range []string{"reject-build", "reject-dataset", "reject-revision"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()
			runCheckpointSubprocess(t, dir, mode, "encounters")
		})
	}
}

func requireCheckpointSubprocessPlatform(t *testing.T) {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("version.BinaryIdentity requires Linux /proc/self/exe; enable when strict identity supports this platform")
	}
}

func runCheckpointSubprocess(t *testing.T, dir, mode, identity string) {
	t.Helper()
	executable, err := os.Executable()
	require.NoError(t, err)
	cmd := exec.CommandContext(testutil.Context(t, testutil.WaitLong), executable,
		"-test.run=^TestCompleteSessionSubprocessHelper$", "-test.count=1", "-test.timeout=20s",
		"--", "chronicle-checkpoint-helper", dir, mode, identity)
	// No inherited credentials or environment-based helper switch. Go's race
	// runtime uses its defaults, including reporting failures through the exit code.
	cmd.Env = []string{"TZ=UTC"}
	output, err := cmd.CombinedOutput() // Wait for process exit, not merely a marker.
	require.NoError(t, err, "mode %s: %s", mode, output)
}

func readCheckpointSubprocessFile(t *testing.T, dir, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err)
	return data
}

func TestCompleteSessionSubprocessHelper(t *testing.T) {
	t.Parallel()
	args := os.Args
	if len(args) < 5 || args[len(args)-5] != "--" || args[len(args)-4] != "chronicle-checkpoint-helper" {
		return
	}
	dir, mode, identity := args[len(args)-3], args[len(args)-2], args[len(args)-1]
	// Fixture construction happens inside EACH subprocess. Only checkpoint bytes
	// cross the process boundary, never prepared graphs, DBs, or runtime callbacks.
	ctx, opts, inputs := completeSessionFixture(t, identity == "identity")
	binaryID, err := version.BinaryIdentity()
	require.NoError(t, err)
	opts.Compatibility.Source.BuildIdentity = binaryID
	ctx = snapshot.WithCompatibility(ctx, opts.Compatibility.Source.RuntimeIdentity())
	path := filepath.Join(dir, "checkpoint.json")
	var session *CompleteFileSession
	switch mode {
	case "capture", "baseline-prefix", "baseline-future":
		session, err = NewCompleteFileSession(ctx, opts)
		require.NoError(t, err)
		if mode == "capture" {
			historical := filepath.Join(dir, "historical.log")
			require.NoError(t, os.WriteFile(historical, []byte(inputs[0]), 0600))
			file, err := os.Open(historical)
			require.NoError(t, err)
			processErr := session.ProcessFile(ctx, opts.Files[0], file)
			require.NoError(t, file.Close())
			require.NoError(t, processErr)
			require.NotEmpty(t, session.root.result.encountersState.Instances)
			require.True(t, session.root.result.encountersState.CurrentInstance.FightActive(), "capture must retain an unfinished fight")
			require.False(t, session.finalized)
			require.NoError(t, session.SnapshotPath(path))
			// Return to the test runner and EXIT. Intentionally no Finalize or defer.
			return
		}
		require.NoError(t, session.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	case "restore-prefix", "restore-future", "reject-build", "reject-dataset", "reject-revision":
		_, err := os.Stat(filepath.Join(dir, "historical.log"))
		require.ErrorIs(t, err, os.ErrNotExist)
		opts = futureSessionOptions(opts, 1)
		if mode == "restore-prefix" {
			opts.Files = nil
		}
		switch mode {
		case "reject-build":
			// Flip one hex digit but retain a valid exact SHA-256 identity.
			last := byte('0')
			if binaryID[len(binaryID)-1] == last {
				last = '1'
			}
			opts.Compatibility.Source.BuildIdentity = binaryID[:len(binaryID)-1] + string(last)
		case "reject-dataset":
			opts.Compatibility.Source.DatasetID = "00000000-0000-0000-0000-000000000002"
		case "reject-revision":
			opts.Compatibility.Source.DatasetRevision++
		}
		session, err = RestoreCompleteFileSessionPath(path, opts)
		if strings.HasPrefix(mode, "reject-") {
			require.ErrorContains(t, err, "compatibility mismatch")
			require.Nil(t, session)
			return
		}
		require.NoError(t, err)
		require.NoError(t, session.WireRuntime(ctx))
		require.NotNil(t, session.root.result.encountersState.CurrentInstance)
		require.True(t, session.root.result.encountersState.CurrentInstance.FightActive(), "restore must preserve the unfinished fight")
	default:
		t.Fatalf("unknown subprocess mode %q", mode)
	}
	if strings.HasSuffix(mode, "future") {
		require.NoError(t, session.ProcessFile(ctx, checkpointTestFile("second", inputs[1]), strings.NewReader(inputs[1])))
	}
	finalized, err := session.Finalize(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, finalized)
	require.NotEmpty(t, finalized[0].Encounters)
	// encoding/json sorts map keys. The existing typed normalizer changes ONLY
	// generated encounter/phase UUIDs and their references, retaining event buffers.
	canonical, err := json.Marshal(normalizedSessionOutput(t, finalized))
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, mode+".json"), canonical, 0600))
}
