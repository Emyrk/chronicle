package chronicle

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNativeCheckpointSubprocess(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, true)
	if input := os.Getenv("CHRONICLE_NATIVE_CHECKPOINT_TEST_INPUT"); input != "" {
		data, err := os.ReadFile(input)
		require.NoError(t, err)
		env, err := DecodeNativeCheckpoint(data)
		require.NoError(t, err)
		parsed, err := restoreNativeCheckpoint(ctx, env, opts.GameDB, opts.Registry)
		require.NoError(t, err)
		var out []json.RawMessage
		for _, instance := range parsed.encountersState.Instances {
			result, err := instance.Finalize(ctx)
			require.NoError(t, err)
			b, err := json.Marshal(result.Encounters)
			require.NoError(t, err)
			out = append(out, b)
		}
		b, err := json.Marshal(out)
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(input+".result", b, 0600))
		return
	}
	recorder := &nativeSpellRecorder{GameDB: opts.GameDB, ids: make(map[chrondbc.SpellID]bool)}
	compute := &parseCompute{logger: opts.Logger}
	parsed, err := compute.parseDebugSession(ctx, opts.Compatibility.Source.Format, []database.LogFile{{ID: uuid.New()}}, nil, recorder, opts.Registry, []byte(inputs[0]+"\n"+inputs[1]), "")
	require.NoError(t, err)
	var saved bytes.Buffer
	require.NoError(t, parsed.snapshot(&saved))
	identity, ok := snapshot.FromContext(ctx)
	require.True(t, ok)
	env := NativeCheckpointEnvelope{Version: 1, Boundary: "COMPLETE/preFinalize", Identity: identity, Snapshot: saved.Bytes(), LogCapabilities: parsed.logCapabilities}
	for id := range recorder.ids {
		env.SpellIDs = append(env.SpellIDs, id)
	}
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	require.NoError(t, json.NewEncoder(gz).Encode(env))
	require.NoError(t, gz.Close())
	input := filepath.Join(t.TempDir(), "complete.json.gz")
	require.NoError(t, os.WriteFile(input, compressed.Bytes(), 0600))
	cmd := exec.CommandContext(t.Context(), os.Args[0], "-test.run=^TestNativeCheckpointSubprocess$", "-test.count=1")
	cmd.Env = append(os.Environ(), "CHRONICLE_NATIVE_CHECKPOINT_TEST_INPUT="+input)
	output, err := cmd.CombinedOutput()
	require.NoError(t, err, string(output))
	var want []json.RawMessage
	for _, instance := range parsed.encountersState.Instances {
		result, err := instance.Finalize(ctx)
		require.NoError(t, err)
		b, err := json.Marshal(result.Encounters)
		require.NoError(t, err)
		want = append(want, b)
	}
	expected, err := json.Marshal(want)
	require.NoError(t, err)
	actual, err := os.ReadFile(input + ".result")
	require.NoError(t, err)
	require.JSONEq(t, string(expected), string(actual))
	env.Identity.BuildIdentity = "wrong-build"
	_, err = restoreNativeCheckpoint(ctx, env, opts.GameDB, opts.Registry)
	require.Error(t, err)
	_, err = DecodeNativeCheckpoint(compressed.Bytes()[:compressed.Len()-5])
	require.Error(t, err)
}

// Storage part boundaries are arbitrary byte offsets, not logical EOFs. A
// frozen prefix must concatenate before parsing, including a split log line.
func TestNativeFrozenPrefixPartialLine(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, true)
	payload := []byte(inputs[0] + "\n" + inputs[1])
	split := bytes.IndexByte(payload, '\n') / 2
	require.Positive(t, split)
	st, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	file := database.LogFile{ID: uuid.New()}
	part := database.LogFilePart{ID: uuid.New(), ObjectKey: "parts/frozen"}
	_, err = st.UploadFile(ctx, BucketRaidLogs, "logs/"+file.ID.String(), bytes.NewReader(payload[:split]))
	require.NoError(t, err)
	_, err = st.UploadFile(ctx, BucketRaidLogs, part.ObjectKey, bytes.NewReader(payload[split:]))
	require.NoError(t, err)
	// A later uploaded part is deliberately excluded from the captured manifest.
	_, err = st.UploadFile(ctx, BucketRaidLogs, "parts/later", bytes.NewBufferString("invalid future input"))
	require.NoError(t, err)
	reader, err := loadRawLogFileWithParts(ctx, st, file, []database.LogFilePart{part})
	require.NoError(t, err)
	assembled, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.Equal(t, payload, assembled)
	compute := &parseCompute{logger: opts.Logger}
	parse := func(data []byte) []json.RawMessage {
		result, err := compute.parseDebugSession(ctx, opts.Compatibility.Source.Format, []database.LogFile{file}, nil, opts.GameDB, opts.Registry, data, "")
		require.NoError(t, err)
		var encounters []json.RawMessage
		for _, instance := range result.encountersState.Instances {
			final, err := instance.Finalize(ctx)
			require.NoError(t, err)
			// Independent full parses allocate new encounter IDs; compare gameplay.
			for i := range final.Encounters {
				final.Encounters[i].Combat.EncounterID = uuid.Nil
			}
			encoded, err := json.Marshal(final.Encounters)
			require.NoError(t, err)
			encounters = append(encounters, encoded)
		}
		return encounters
	}
	want, err := json.Marshal(parse(payload))
	require.NoError(t, err)
	got, err := json.Marshal(parse(assembled))
	require.NoError(t, err)
	require.JSONEq(t, string(want), string(got))
}

func TestNativeLeaseTiming(t *testing.T) {
	t.Parallel()
	defaults, err := normalizeNativeLeaseTiming(NativeParseOptions{})
	require.NoError(t, err)
	require.Equal(t, 2*time.Minute, defaults.LeaseTTL)
	require.Equal(t, 30*time.Second, defaults.RenewEvery)
	valid, err := normalizeNativeLeaseTiming(NativeParseOptions{LeaseTTL: time.Minute, RenewEvery: 10 * time.Second})
	require.NoError(t, err)
	require.Equal(t, time.Minute, valid.LeaseTTL)
	for _, opts := range []NativeParseOptions{{LeaseTTL: -time.Second}, {RenewEvery: -time.Second}, {LeaseTTL: time.Second, RenewEvery: time.Second}, {LeaseTTL: time.Second, RenewEvery: 2 * time.Second}, {LeaseTTL: time.Nanosecond, RenewEvery: time.Nanosecond}} {
		_, err := normalizeNativeLeaseTiming(opts)
		require.Error(t, err)
	}
}
