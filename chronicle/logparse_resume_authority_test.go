package chronicle

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Restore inputs are the explicit future suffix, never a replay of saved history.
func futureSessionOptions(o CompleteSessionOptions, completedCount int) CompleteSessionOptions {
	if o.Bundles != nil {
		o.Bundles = o.Bundles[completedCount:]
	} else {
		o.Files = o.Files[completedCount:]
	}
	return o
}

func TestBundleCheckpointAuthorityAfterHistoricalFilesDeleted(t *testing.T) {
	t.Parallel()
	ctx, opts, logs, payloads := bundleFixture(t, 3, true)
	// Split the suffix into B (damage) and C (death), preserving complete records.
	suffix := strings.SplitN(logs[1], "\n", 2)
	require.Len(t, suffix, 2)
	logs = []string{logs[0], suffix[0], suffix[1]}
	opts.Bundles[1].File = checkpointTestFile("B", logs[1])
	opts.Bundles = append(opts.Bundles, CompleteBundle{File: checkpointTestFile("C", logs[2])})
	baseline := newExpansionSession(t, ctx, opts)
	require.NoError(t, baseline.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)))
	want, err := baseline.Finalize(ctx)
	require.NoError(t, err)
	dir := t.TempDir()
	logPath := filepath.Join(dir, "A.log")
	require.NoError(t, os.WriteFile(logPath, []byte(logs[0]), 0600))
	original := newExpansionSession(t, ctx, opts)
	input, err := os.Open(logPath)
	require.NoError(t, err)
	bundle := FileBundle{File: opts.Bundles[0].File, Input: input}
	var paths []string
	var files []*os.File
	for i, a := range opts.Bundles[0].Artifacts {
		path := filepath.Join(dir, a.ID+".lua")
		require.NoError(t, os.WriteFile(path, []byte(payloads[i]), 0600))
		f, err := os.Open(path)
		require.NoError(t, err)
		paths = append(paths, path)
		files = append(files, f)
		bundle.Artifacts = append(bundle.Artifacts, BundleArtifactInput{Artifact: a, Input: f})
	}
	require.NoError(t, original.ProcessFiles(ctx, []FileBundle{bundle}))
	require.NoError(t, input.Close())
	for _, f := range files {
		require.NoError(t, f.Close())
	}
	firstPath := filepath.Join(dir, "A.snapshot")
	require.NoError(t, original.SnapshotPath(firstPath))
	require.NoError(t, os.Remove(logPath))
	for _, path := range paths {
		require.NoError(t, os.Remove(path))
		require.NoFileExists(t, path)
	}
	require.NoFileExists(t, logPath)
	// No historical source location or descriptor is passed to either restore.
	onlyB := futureSessionOptions(opts, 1)
	onlyB.Bundles = onlyB.Bundles[:1]
	next, err := RestoreCompleteFileSessionPath(firstPath, onlyB)
	require.NoError(t, err)
	require.Equal(t, 1, next.completed)
	require.NoError(t, next.WireRuntime(ctx))
	require.NoError(t, next.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[1:2]))
	require.Equal(t, 2, next.completed)
	var second bytes.Buffer
	require.NoError(t, next.Snapshot(&second))
	var envelope struct {
		Bundles []CompleteBundle `json:"bundles"`
	}
	require.NoError(t, json.Unmarshal(second.Bytes(), &envelope))
	require.Equal(t, opts.Bundles[:2], envelope.Bundles)
	last, err := RestoreCompleteFileSession(bytes.NewReader(second.Bytes()), futureSessionOptions(opts, 2))
	require.NoError(t, err)
	require.NoError(t, last.WireRuntime(ctx))
	require.NoError(t, last.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[2:]))
	require.Equal(t, 3, last.completed)
	var third bytes.Buffer
	require.NoError(t, last.Snapshot(&third))
	require.NoError(t, json.Unmarshal(third.Bytes(), &envelope))
	require.Equal(t, opts.Bundles, envelope.Bundles)
	terminal, err := RestoreCompleteFileSession(bytes.NewReader(third.Bytes()), futureSessionOptions(opts, 3))
	require.NoError(t, err)
	require.NoError(t, terminal.WireRuntime(ctx))
	got, err := terminal.Finalize(ctx)
	require.NoError(t, err)
	require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
	require.Equal(t, normalizedExpansionEvents(t, baseline, want), normalizedExpansionEvents(t, terminal, got))
	require.Equal(t, baseline.root.result.creaturesState, terminal.root.result.creaturesState)
}

func TestBundleRestoreRejectsHistoricalIDsAsFutureReplay(t *testing.T) {
	t.Parallel()
	ctx, opts, logs, payloads := bundleFixture(t, 2, false)
	s := newExpansionSession(t, ctx, opts)
	require.NoError(t, s.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[:1]))
	var saved bytes.Buffer
	require.NoError(t, s.Snapshot(&saved))
	for _, kind := range []string{"file", "artifact"} {
		t.Run(kind, func(t *testing.T) {
			future := futureSessionOptions(opts, 1)
			future.Bundles = append([]CompleteBundle(nil), future.Bundles...)
			if kind == "file" {
				future.Bundles[0].File.ID = opts.Bundles[0].File.ID
			} else {
				future.Bundles[0].Artifacts = []CompleteArtifact{opts.Bundles[0].Artifacts[0]}
				future.Bundles[0].Artifacts[0].SHA256 = strings.Repeat("f", 64)
			}
			_, err := RestoreCompleteFileSession(bytes.NewReader(saved.Bytes()), future)
			require.Error(t, err)
		})
	}
}

func TestBundleRestoredFutureContentMismatchIsTerminal(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"file", "artifact"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			ctx, opts, logs, payloads := bundleFixture(t, 2, false)
			opts.Bundles[1].Artifacts = []CompleteArtifact{bundleArtifact("future-artifact", 2, payloads[0])}
			original := newExpansionSession(t, ctx, opts)
			require.NoError(t, original.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[:1]))
			var saved bytes.Buffer
			require.NoError(t, original.Snapshot(&saved))
			restored, err := RestoreCompleteFileSession(bytes.NewReader(saved.Bytes()), futureSessionOptions(opts, 1))
			require.NoError(t, err)
			require.NoError(t, restored.WireRuntime(ctx))
			inputs := bundleInputs(opts, logs, payloads)[1:]
			if kind == "file" {
				inputs[0].Input = strings.NewReader(logs[1] + "\n")
			} else {
				inputs[0].Artifacts[0].Input = strings.NewReader(payloads[0] + " ")
			}
			require.Error(t, restored.ProcessFiles(ctx, inputs))
			require.Equal(t, 1, restored.completed)
			require.Error(t, restored.Snapshot(&bytes.Buffer{}))
			_, err = restored.Finalize(ctx)
			require.Error(t, err)
		})
	}
}
