package chronicle

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

// The encoded records match the canonical Sidekick decoder fixtures. Only the
// clock/map are changed to place telemetry in the real production encounter.
func bundleSidekickPayload(version int32, offset time.Duration) string {
	at := time.Date(2026, 1, 14, 20, 40, 0, 0, time.UTC).Add(offset)
	stamp := strconv.FormatInt(at.UnixMilli(), 36)
	root := "ChronicleSidekickBridgeWoTLKDB"
	chunk := stamp + ":0h3:000ya4dqdw6y017ps000rszz;"
	encoded := 122
	extra := fmt.Sprintf(`state_chunks = { "%s:0000n5c00ffk0;%s:01012kw000001;" }, current_state_chunk_records = 2, state_count = 2,`, stamp, stamp)
	if version == 1 {
		root = "ChronicleCompanionWoTLKDB"
		chunk = stamp + ":0h3:000ya4dq017ps000;"
		encoded = 68
		extra = ""
	}
	if version == 3 {
		chunk = stamp + ":0h3:02:000ya4dqdw6y017ps000rszz;"
		encoded = 125
	}
	return fmt.Sprintf(`%s = { position_payload = { schema_version = %d, encoding = "b36-v%d", guids = { "0x0000000000000001", "0x0000000000000002" }, chunks = { "%s" }, %s current_chunk_ticks = 1, tick_count = 1, position_count = 2, encoded_bytes = %d } }`, root, version, version, chunk, extra, encoded)
}
func bundleArtifact(id string, version int32, data string) CompleteArtifact {
	f := checkpointTestFile(id, data)
	return CompleteArtifact{ID: id, Kind: ArtifactKindSidekickStorage, SchemaVersion: version, Size: f.Size, SHA256: f.SHA256}
}
func bundleFixture(t *testing.T, version int32, identity bool) (context.Context, CompleteSessionOptions, []string, []string) {
	t.Helper()
	ctx, opts, inputs := expansionSessionFixture(t, expansionSessionCase{database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath}}, identity)
	payloads := []string{bundleSidekickPayload(version, 2*time.Second), bundleSidekickPayload(version, 3*time.Second)}
	opts.Bundles = []CompleteBundle{{File: opts.Files[0], Artifacts: []CompleteArtifact{bundleArtifact("tie", version, payloads[0]), bundleArtifact("tail", version, payloads[1])}}, {File: opts.Files[1]}}
	opts.Files = nil
	return ctx, opts, inputs, payloads
}
func bundleInputs(opts CompleteSessionOptions, logs, payloads []string) []FileBundle {
	result := make([]FileBundle, len(logs))
	for i, input := range logs {
		result[i] = FileBundle{File: opts.Bundles[i].File, Input: strings.NewReader(input)}
		for j, a := range opts.Bundles[i].Artifacts {
			result[i].Artifacts = append(result[i].Artifacts, BundleArtifactInput{Artifact: a, Input: strings.NewReader(payloads[j])})
		}
	}
	return result
}

func TestBundleSidekickDiskContinuation(t *testing.T) {
	t.Parallel()
	for _, version := range []int32{1, 2, 3} {
		for _, identity := range []bool{false, true} {
			t.Run(fmt.Sprintf("v%d/identity=%t", version, identity), func(t *testing.T) {
				t.Parallel()
				ctx, opts, logs, payloads := bundleFixture(t, version, identity)
				baseline := newExpansionSession(t, ctx, opts)
				require.NoError(t, baseline.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)))
				want, err := baseline.Finalize(ctx)
				require.NoError(t, err)
				streams := normalizedExpansionEvents(t, baseline, want)
				require.NotEmpty(t, streams[0]["UnitPosition"])
				if version > 1 {
					require.NotEmpty(t, streams[0]["UnitResources"])
				}
				original := newExpansionSession(t, ctx, opts)
				require.NoError(t, original.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[:1]))
				require.Equal(t, 1, original.completed)
				require.Contains(t, original.root.result.logCapabilities, "unit-position")
				if version > 1 {
					require.Contains(t, original.root.result.logCapabilities, "unit-resources")
				}
				path := filepath.Join(t.TempDir(), "bundle.json")
				require.NoError(t, original.SnapshotPath(path))
				restored, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
				require.NoError(t, err)
				require.NoError(t, restored.WireRuntime(ctx))
				require.NotSame(t, original.root.result.encountersState.Units, restored.root.result.encountersState.Units)
				for _, s := range []*CompleteFileSession{original, restored} {
					require.NoError(t, s.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[1:]))
					require.Contains(t, s.root.result.logCapabilities, "unit-position")
					if version > 1 {
						require.Contains(t, s.root.result.logCapabilities, "unit-resources")
					}
					got, err := s.Finalize(ctx)
					require.NoError(t, err)
					require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
					require.Equal(t, normalizedExpansionEvents(t, baseline, want), normalizedExpansionEvents(t, s, got))
					require.Equal(t, baseline.root.result.logCapabilities, s.root.result.logCapabilities)
					if identity {
						require.Equal(t, baseline.root.result.creaturesState, s.root.result.creaturesState)
					}
				}
				// Artifact text is not part of combat-log line metrics.
				plainOpts := opts
				plainOpts.Bundles = []CompleteBundle{{File: opts.Bundles[0].File}, {File: opts.Bundles[1].File}}
				plain := newExpansionSession(t, ctx, plainOpts)
				require.NoError(t, plain.ProcessFiles(ctx, bundleInputs(plainOpts, logs, nil)))
				require.Equal(t, plain.root.result.report.totalLines, baseline.root.result.report.totalLines)
			})
		}
	}
}

func TestBundleSidekickOrderingAndTail(t *testing.T) {
	t.Parallel()
	ctx, opts, logs, payloads := bundleFixture(t, 2, false)
	// Artifact order regresses after the first native EOF; do not sort it globally.
	payloads = append(payloads, bundleSidekickPayload(2, 1500*time.Millisecond))
	opts.Bundles[0].Artifacts = append(opts.Bundles[0].Artifacts, bundleArtifact("regression", 2, payloads[2]))
	s := newExpansionSession(t, ctx, opts)
	observed := &sessionCollector{}
	s.root.result.consumers = consumers.New(opts.Logger, s.root.result.encountersState, observed)
	require.NoError(t, s.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[:1]))
	var got []string
	at := time.Date(2026, 1, 14, 20, 40, 0, 0, time.UTC)
	for _, m := range observed.messages {
		switch m.(type) {
		case *messages.Damage:
			got = append(got, "damage/"+m.Date().Sub(at).String())
		case *messages.UnitPosition:
			got = append(got, "position/"+m.Date().Sub(at).String())
		}
	}
	require.Equal(t, []string{"damage/2s", "position/2s", "position/2s", "position/3s", "position/3s", "position/1.5s", "position/1.5s"}, got)
	require.Equal(t, 1, s.completed)
}

func TestBundleHistoricalArtifactMetadataIsNotRestoreInput(t *testing.T) {
	t.Parallel()
	ctx, opts, logs, payloads := bundleFixture(t, 2, false)
	s := newExpansionSession(t, ctx, opts)
	require.NoError(t, s.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[:1]))
	var saved bytes.Buffer
	require.NoError(t, s.Snapshot(&saved))
	for _, name := range []string{"changed", "reordered", "removed", "added"} {
		t.Run(name, func(t *testing.T) {
			changed := opts
			changed.Bundles = append([]CompleteBundle(nil), opts.Bundles...)
			changed.Bundles[0].Artifacts = append([]CompleteArtifact(nil), opts.Bundles[0].Artifacts...)
			a := changed.Bundles[0].Artifacts
			switch name {
			case "changed":
				a[0].SHA256 = strings.Repeat("b", 64)
			case "reordered":
				a[0], a[1] = a[1], a[0]
			case "removed":
				a = a[:1]
			case "added":
				extra := a[0]
				extra.ID = "extra"
				a = append(a, extra)
			}
			changed.Bundles[0].Artifacts = a
			restored, err := RestoreCompleteFileSession(bytes.NewReader(saved.Bytes()), futureSessionOptions(changed, 1))
			require.NoError(t, err)
			require.NoError(t, restored.WireRuntime(ctx))
			require.NoError(t, restored.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[1:]))
		})
	}
}

func TestBundleArtifactFailuresAreTerminal(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"checksum", "schema", "decode", "read", "size"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, opts, logs, payloads := bundleFixture(t, 2, false)
			// First bundle succeeds, then fail a suffix artifact without advancing prefix.
			opts.Bundles[0].Artifacts = nil
			opts.Bundles[1].Artifacts = []CompleteArtifact{bundleArtifact("bad", 2, payloads[0])}
			switch name {
			case "checksum":
				opts.Bundles[1].Artifacts[0].SHA256 = strings.Repeat("b", 64)
			case "schema":
				opts.Bundles[1].Artifacts[0].SchemaVersion = 3
			case "decode":
				payloads[0] = "not lua"
				opts.Bundles[1].Artifacts[0] = bundleArtifact("bad", 2, payloads[0])
			case "size":
				opts.Bundles[1].Artifacts[0].Size++
			}
			s := newExpansionSession(t, ctx, opts)
			require.NoError(t, s.ProcessFiles(ctx, bundleInputs(opts, logs, payloads)[:1]))
			var prefix bytes.Buffer
			require.NoError(t, s.Snapshot(&prefix))
			inputs := bundleInputs(opts, logs, payloads)[1:]
			if name == "read" {
				inputs[0].Artifacts[0].Input = completeSessionFailReader{}
			}
			require.Error(t, s.ProcessFiles(ctx, inputs))
			require.Equal(t, 1, s.completed)
			require.Error(t, s.Snapshot(io.Discard))
			require.Error(t, s.ProcessFiles(ctx, nil))
			restored, err := RestoreCompleteFileSession(bytes.NewReader(prefix.Bytes()), futureSessionOptions(opts, 1))
			require.NoError(t, err)
			require.Equal(t, 1, restored.completed)
		})
	}
}

type bundleReadProbe struct {
	io.Reader
	onRead func()
	closed bool
}

func (r *bundleReadProbe) Read(p []byte) (int, error) {
	if r.onRead != nil {
		f := r.onRead
		r.onRead = nil
		f()
	}
	return r.Reader.Read(p)
}
func (r *bundleReadProbe) Close() error { r.closed = true; return nil }
func TestBundleReaderOwnership(t *testing.T) {
	t.Parallel()
	ctx, opts, logs, payloads := bundleFixture(t, 2, false)
	s := newExpansionSession(t, ctx, opts)
	inputs := bundleInputs(opts, logs, payloads)[:1]
	log := &bundleReadProbe{Reader: inputs[0].Input}
	artifact := &bundleReadProbe{Reader: inputs[0].Artifacts[0].Input}
	inputs[0].Input = log
	inputs[0].Artifacts[0].Input = artifact
	require.NoError(t, s.ProcessFiles(ctx, inputs))
	require.False(t, log.closed)
	require.False(t, artifact.closed)
}
func TestBundleRejectsMidBundleSnapshot(t *testing.T) {
	t.Parallel()
	ctx, opts, logs, payloads := bundleFixture(t, 2, false)
	s := newExpansionSession(t, ctx, opts)
	inputs := bundleInputs(opts, logs, payloads)[:1]
	var checkpoint bytes.Buffer
	var snapshotErr error
	inputs[0].Artifacts[0].Input = &bundleReadProbe{Reader: inputs[0].Artifacts[0].Input, onRead: func() { snapshotErr = s.Snapshot(&checkpoint) }}
	require.Error(t, s.ProcessFiles(ctx, inputs))
	require.Error(t, snapshotErr)
	require.Empty(t, checkpoint.Bytes())
	require.Zero(t, s.completed)
}

func TestBundleOtherSourcesVerifyButIgnoreArtifactGameplay(t *testing.T) {
	t.Parallel()
	for _, tc := range []expansionSessionCase{
		{database.LogFormat243CcAddon, database.WoWFlavor{database.FlavorTBC}},
		{database.LogFormatV9Cleu, database.WoWFlavor{database.FlavorWrath}},
		{database.LogFormatV22Cleu, database.WoWFlavor{database.FlavorWrath}},
		{database.LogFormatHermesproxy1142Cc, database.WoWFlavor{database.FlavorWrath}},
	} {
		t.Run(string(tc.format), func(t *testing.T) {
			t.Parallel()
			ctx, opts, logs := expansionSessionFixture(t, tc, false)
			plain := newExpansionSession(t, ctx, opts)
			for i, log := range logs {
				require.NoError(t, plain.ProcessFile(ctx, opts.Files[i], strings.NewReader(log)))
			}
			want, err := plain.Finalize(ctx)
			require.NoError(t, err)
			// Intentionally not valid Sidekick Lua: these worker formats never decode it.
			payload := "opaque ignored artifact bytes"
			opts.Bundles = []CompleteBundle{{File: opts.Files[0], Artifacts: []CompleteArtifact{bundleArtifact("ignored", 2, payload)}}, {File: opts.Files[1]}}
			opts.Files = nil
			s := newExpansionSession(t, ctx, opts)
			require.NoError(t, s.ProcessFiles(ctx, bundleInputs(opts, logs, []string{payload})))
			got, err := s.Finalize(ctx)
			require.NoError(t, err)
			require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
			require.Equal(t, normalizedExpansionEvents(t, plain, want), normalizedExpansionEvents(t, s, got))
			require.Equal(t, plain.root.result.logCapabilities, s.root.result.logCapabilities)
			bad := newExpansionSession(t, ctx, opts)
			inputs := bundleInputs(opts, logs, []string{payload + "changed"})
			require.Error(t, bad.ProcessFiles(ctx, inputs[:1]))
			require.Zero(t, bad.completed)
			require.Error(t, bad.Snapshot(io.Discard))
		})
	}
}
