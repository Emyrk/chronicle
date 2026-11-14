package chronicle

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func checkpointTestIdentity() SessionCompatibility {
	return SessionCompatibility{Source: nextsource.Compatibility{DatasetID: "00000000-0000-0000-0000-000000000001", DatasetRevision: 1, BuildIdentity: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Format: database.LogFormat112aCcAddon, Flavor: "turtle", BuildVersion: "test", CustomOverrideVersion: "test"}, Recipe: "production-v1", Policy: "test-v1"}
}
func checkpointTestFile(id, content string) CompleteFile {
	sum := sha256.Sum256([]byte(content))
	return CompleteFile{ID: id, Size: int64(len(content)), SHA256: hex.EncodeToString(sum[:])}
}
func TestCheckpointEnvelopePreflight(t *testing.T) {
	t.Parallel()
	identity := checkpointTestIdentity()
	bundles := []CompleteBundle{{File: checkpointTestFile("a", "first")}, {File: checkpointTestFile("b", "second")}}
	env := checkpointEnvelope{Version: checkpointVersion, Compatibility: identity, Bundles: bundles[:1]}
	data, err := json.Marshal(env)
	require.NoError(t, err)
	_, err = readCheckpoint(bytes.NewReader(data), identity, bundles[1:])
	require.NoError(t, err)
	for _, tc := range []struct {
		name   string
		change func(*checkpointEnvelope)
	}{
		{"version", func(e *checkpointEnvelope) { e.Version++ }},
		{"build", func(e *checkpointEnvelope) { e.Compatibility.Source.BuildIdentity = "other" }},
		{"dataset", func(e *checkpointEnvelope) { e.Compatibility.Source.DatasetRevision++ }},
		{"policy", func(e *checkpointEnvelope) { e.Compatibility.Policy = "other" }},
		{"recipe", func(e *checkpointEnvelope) { e.Compatibility.Recipe = "other" }},
		{"identity", func(e *checkpointEnvelope) { e.Compatibility.IdentityMode = true }},
		{"invalid saved provenance", func(e *checkpointEnvelope) { e.Bundles = []CompleteBundle{{File: CompleteFile{ID: "invalid"}}} }},
		{"empty", func(e *checkpointEnvelope) { e.Bundles = nil }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			changed := env
			tc.change(&changed)
			b, e := json.Marshal(changed)
			require.NoError(t, e)
			_, e = readCheckpoint(bytes.NewReader(b), identity, nil)
			require.Error(t, e)
		})
	}
	for _, bad := range [][]byte{append(append([]byte(nil), data...), data...), []byte(`{"version":1,"version":1}`), []byte(`{"a":{"b":1,"b":2}}`), []byte(`null`), data[:len(data)-1]} {
		_, err = readCheckpoint(bytes.NewReader(bad), identity, nil)
		require.Error(t, err)
	}
}
func TestCheckpointAtomicReplacement(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "checkpoint.json")
	require.NoError(t, replaceCheckpoint(path, []byte("first")))
	require.NoError(t, replaceCheckpoint(path, []byte("second")))
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, "second", string(data))
	// A rename failure must not delete the existing destination or leave temp files.
	blocked := filepath.Join(t.TempDir(), "existing-directory")
	require.NoError(t, os.Mkdir(blocked, 0700))
	require.Error(t, replaceCheckpoint(blocked, []byte("bad")))
	entries, err := os.ReadDir(filepath.Dir(blocked))
	require.NoError(t, err)
	require.Len(t, entries, 1)
}

func TestCompleteSessionTerminalAndFailedLifecycle(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name    string
		session CompleteFileSession
	}{
		{"failed", CompleteFileSession{failed: errors.New("input failure")}},
		{"finalized", CompleteFileSession{finalized: true}},
		{"unwired", CompleteFileSession{pending: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			s := tc.session
			require.Error(t, s.ProcessFile(t.Context(), checkpointTestFile("a", ""), strings.NewReader("")))
			require.Error(t, s.SnapshotPath(filepath.Join(t.TempDir(), "checkpoint")))
			_, err := s.Finalize(t.Context())
			require.Error(t, err)
		})
	}
}
func TestRestoreCompatibilityPrecedesDependencies(t *testing.T) {
	t.Parallel()
	identity := checkpointTestIdentity()
	files := []CompleteFile{checkpointTestFile("a", "")}
	env := checkpointEnvelope{Version: checkpointVersion, Compatibility: identity, Bundles: []CompleteBundle{{File: files[0]}}}
	env.Compatibility.Policy = "wrong"
	data, err := json.Marshal(env)
	require.NoError(t, err)
	// Deliberately nil all dependency and recipe objects. A mismatch must fail
	// at preflight, never attempt codec registration or runtime dependency access.
	_, err = RestoreCompleteFileSession(bytes.NewReader(data), CompleteSessionOptions{Compatibility: identity, Files: files})
	require.ErrorContains(t, err, "compatibility mismatch")
}

func TestCheckpointReplacementFaults(t *testing.T) {
	t.Parallel()
	for _, fault := range []string{"write", "short-write", "file-sync", "rename", "directory-sync"} {
		t.Run(fault, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "checkpoint.json")
			require.NoError(t, os.WriteFile(path, []byte("previous"), 0600))
			injected := errors.New("injected " + fault)
			ops := checkpointFileOps{write: (*os.File).Write, syncFile: (*os.File).Sync, rename: os.Rename, syncDirectory: (*os.File).Sync}
			var renameCalled, directorySyncCalled bool
			ops.rename = func(from, to string) error {
				renameCalled = true
				if fault == "rename" {
					return injected
				}
				return os.Rename(from, to)
			}
			ops.syncDirectory = func(dir *os.File) error {
				directorySyncCalled = true
				if fault == "directory-sync" {
					return injected
				}
				return dir.Sync()
			}
			switch fault {
			case "write":
				ops.write = func(f *os.File, b []byte) (int, error) {
					n, err := f.Write(b[:2])
					require.NoError(t, err)
					return n, injected
				}
			case "short-write":
				ops.write = func(f *os.File, b []byte) (int, error) { return f.Write(b[:2]) }
			case "file-sync":
				ops.syncFile = func(*os.File) error { return injected }
			}
			err := replaceCheckpointWithOps(path, []byte("replacement"), ops)
			require.Error(t, err)
			if fault == "short-write" {
				require.ErrorIs(t, err, io.ErrShortWrite)
			} else {
				require.ErrorIs(t, err, injected)
			}
			var durability *CheckpointDurabilityError
			data, readErr := os.ReadFile(path)
			require.NoError(t, readErr)
			if fault == "directory-sync" {
				require.ErrorAs(t, err, &durability)
				require.Equal(t, path, durability.Path)
				require.ErrorContains(t, err, "crash durability is unknown")
				require.Equal(t, "replacement", string(data))
				require.True(t, renameCalled)
				require.True(t, directorySyncCalled)
			} else {
				require.False(t, errors.As(err, &durability))
				require.Equal(t, "previous", string(data))
				require.Equal(t, fault == "rename", renameCalled)
				require.False(t, directorySyncCalled)
			}
			entries, listErr := os.ReadDir(filepath.Dir(path))
			require.NoError(t, listErr)
			require.Len(t, entries, 1, "temporary checkpoint must be removed on every error path")
			require.Equal(t, "checkpoint.json", entries[0].Name())
		})
	}
}

func checkpointTestArtifact(id, content string, schema int32) CompleteArtifact {
	file := checkpointTestFile(id, content)
	return CompleteArtifact{ID: file.ID, Kind: ArtifactKindSidekickStorage, SchemaVersion: schema, Size: file.Size, SHA256: file.SHA256}
}

func TestCheckpointBundleDescriptors(t *testing.T) {
	t.Parallel()
	bundles := []CompleteBundle{
		{File: checkpointTestFile("file-a", "a"), Artifacts: []CompleteArtifact{checkpointTestArtifact("sidekick-a", "one", 1), checkpointTestArtifact("sidekick-b", "two", 2)}},
		{File: checkpointTestFile("file-b", "b"), Artifacts: []CompleteArtifact{checkpointTestArtifact("sidekick-c", "three", 3)}},
	}
	require.NoError(t, validateCompleteBundles(bundles))
	for _, tc := range []struct {
		name   string
		change func([]CompleteBundle)
	}{
		{"duplicate file", func(b []CompleteBundle) { b[1].File = b[0].File }},
		{"duplicate artifact within bundle", func(b []CompleteBundle) { b[0].Artifacts[1] = b[0].Artifacts[0] }},
		{"duplicate artifact across bundles", func(b []CompleteBundle) { b[1].Artifacts[0] = b[0].Artifacts[0] }},
		{"empty artifact ID", func(b []CompleteBundle) { b[0].Artifacts[0].ID = "" }},
		{"unknown kind", func(b []CompleteBundle) { b[0].Artifacts[0].Kind = "unknown" }},
		{"schema zero", func(b []CompleteBundle) { b[0].Artifacts[0].SchemaVersion = 0 }},
		{"schema future", func(b []CompleteBundle) { b[0].Artifacts[0].SchemaVersion = 4 }},
		{"negative size", func(b []CompleteBundle) { b[0].Artifacts[0].Size = -1 }},
		{"oversize", func(b []CompleteBundle) { b[0].Artifacts[0].Size = (8 << 20) + 1 }},
		{"hash invalid", func(b []CompleteBundle) { b[0].Artifacts[0].SHA256 = "invalid" }},
		{"hash uppercase", func(b []CompleteBundle) { b[0].Artifacts[0].SHA256 = strings.ToUpper(b[0].Artifacts[0].SHA256) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			bad := cloneCompleteBundles(bundles)
			tc.change(bad)
			require.Error(t, validateCompleteBundles(bad))
		})
	}
	separateNamespaces := cloneCompleteBundles(bundles)
	separateNamespaces[0].Artifacts[0].ID = separateNamespaces[0].File.ID
	require.NoError(t, validateCompleteBundles(separateNamespaces))
	exactLimit := cloneCompleteBundles(bundles)
	exactLimit[0].Artifacts[0].Size = 8 << 20
	require.NoError(t, validateCompleteBundles(exactLimit))
	emptyArtifact := cloneCompleteBundles(bundles)
	emptyArtifact[0].Artifacts[0] = checkpointTestArtifact("empty", "", 1)
	require.NoError(t, validateCompleteBundles(emptyArtifact))
	copied := cloneCompleteBundles(bundles)
	require.True(t, equalCompleteBundle(bundles[0], copied[0]))
	copied[0].Artifacts[0].ID = "changed"
	require.Equal(t, "sidekick-a", bundles[0].Artifacts[0].ID)
	require.False(t, equalCompleteBundle(bundles[0], copied[0]))
	require.True(t, equalCompleteBundle(CompleteBundle{File: bundles[0].File}, CompleteBundle{File: bundles[0].File, Artifacts: []CompleteArtifact{}}))
}

func TestCheckpointAuthoritativeProvenanceAndFutureInput(t *testing.T) {
	t.Parallel()
	identity := checkpointTestIdentity()
	completed := []CompleteBundle{
		{File: checkpointTestFile("a", "deleted historical file"), Artifacts: []CompleteArtifact{checkpointTestArtifact("artifact-a", "deleted historical artifact", 1)}},
		{File: checkpointTestFile("b", "also deleted"), Artifacts: []CompleteArtifact{checkpointTestArtifact("artifact-b", "also deleted artifact", 2)}},
	}
	future := []CompleteBundle{{File: checkpointTestFile("c", "new input"), Artifacts: []CompleteArtifact{checkpointTestArtifact("artifact-c", "new artifact", 3)}}}
	env := checkpointEnvelope{Version: checkpointVersion, Compatibility: identity, Bundles: completed}
	data, err := json.Marshal(env)
	require.NoError(t, err)
	// The caller supplies only C. Historical A/B are represented exclusively by
	// checkpoint provenance; no files, readers, or current metadata are needed.
	restored, err := readCheckpoint(bytes.NewReader(data), identity, future)
	require.NoError(t, err)
	require.Equal(t, completed, restored.Bundles)
	// A checkpoint with more completed bundles than future input is valid, as is
	// no future input at all (restore -> Finalize or recheckpoint).
	for _, empty := range [][]CompleteBundle{nil, {}} {
		restored, err := readCheckpoint(bytes.NewReader(data), identity, empty)
		require.NoError(t, err)
		require.Equal(t, completed, restored.Bundles)
	}
	// New future IDs may have any valid bytes/schema. There is no descriptor
	// comparison, prefix inference, or requirement to repeat historical records.
	different := cloneCompleteBundles(future)
	different[0].File = checkpointTestFile("d", "entirely different input")
	different[0].Artifacts[0] = checkpointTestArtifact("artifact-d", "different artifact", 1)
	_, err = readCheckpoint(bytes.NewReader(data), identity, different)
	require.NoError(t, err)
	for _, tc := range []struct {
		name   string
		change func([]CompleteBundle)
	}{
		{"replayed file unchanged", func(b []CompleteBundle) { b[0].File = completed[0].File }},
		{"replayed file changed bytes", func(b []CompleteBundle) { b[0].File = checkpointTestFile("a", "replacement bytes") }},
		{"replayed artifact unchanged", func(b []CompleteBundle) { b[0].Artifacts[0] = completed[1].Artifacts[0] }},
		{"replayed artifact changed metadata", func(b []CompleteBundle) {
			b[0].Artifacts[0] = checkpointTestArtifact("artifact-b", "replacement bytes", 3)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			changed := cloneCompleteBundles(future)
			tc.change(changed)
			_, err := readCheckpoint(bytes.NewReader(data), identity, changed)
			require.ErrorContains(t, err, "already completed")
		})
	}
	// File and artifact IDs retain their existing separate namespaces.
	separate := cloneCompleteBundles(future)
	separate[0].File.ID = completed[0].Artifacts[0].ID
	separate[0].Artifacts[0].ID = completed[0].File.ID
	_, err = readCheckpoint(bytes.NewReader(data), identity, separate)
	require.NoError(t, err)
	// Future input still gets full structural validation before session use.
	badFuture := cloneCompleteBundles(future)
	badFuture[0].Artifacts[0].SHA256 = "bad"
	_, err = readCheckpoint(bytes.NewReader(data), identity, badFuture)
	require.Error(t, err)
}

func TestCheckpointRejectsMalformedSavedProvenance(t *testing.T) {
	t.Parallel()
	identity := checkpointTestIdentity()
	completed := []CompleteBundle{
		{File: checkpointTestFile("a", "first"), Artifacts: []CompleteArtifact{checkpointTestArtifact("artifact-a", "one", 1)}},
		{File: checkpointTestFile("b", "second"), Artifacts: []CompleteArtifact{checkpointTestArtifact("artifact-b", "two", 2)}},
	}
	for _, tc := range []struct {
		name   string
		change func(*checkpointEnvelope)
	}{
		{"empty", func(e *checkpointEnvelope) { e.Bundles = nil }},
		{"duplicate saved files", func(e *checkpointEnvelope) { e.Bundles[1].File = e.Bundles[0].File }},
		{"duplicate saved artifacts", func(e *checkpointEnvelope) { e.Bundles[1].Artifacts[0] = e.Bundles[0].Artifacts[0] }},
		{"invalid saved file hash", func(e *checkpointEnvelope) { e.Bundles[0].File.SHA256 = "bad" }},
		{"invalid saved artifact hash", func(e *checkpointEnvelope) { e.Bundles[0].Artifacts[0].SHA256 = "bad" }},
		{"invalid saved artifact schema", func(e *checkpointEnvelope) { e.Bundles[0].Artifacts[0].SchemaVersion = 99 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			env := checkpointEnvelope{Version: checkpointVersion, Compatibility: identity, Bundles: cloneCompleteBundles(completed)}
			tc.change(&env)
			data, err := json.Marshal(env)
			require.NoError(t, err)
			_, err = readCheckpoint(bytes.NewReader(data), identity, nil)
			require.Error(t, err)
		})
	}
}

func TestCheckpointBundleStrictFieldsAndV1Rejection(t *testing.T) {
	t.Parallel()
	identity := checkpointTestIdentity()
	bundles := []CompleteBundle{{File: checkpointTestFile("a", "first"), Artifacts: []CompleteArtifact{checkpointTestArtifact("artifact-a", "one", 1)}}}
	env := checkpointEnvelope{Version: checkpointVersion, Compatibility: identity, Bundles: bundles}
	data, err := json.Marshal(env)
	require.NoError(t, err)
	for _, field := range []string{"id", "kind", "schema_version", "size", "sha256"} {
		t.Run("missing artifact "+field, func(t *testing.T) {
			t.Parallel()
			var document map[string]any
			require.NoError(t, json.Unmarshal(data, &document))
			bundle := document["bundles"].([]any)[0].(map[string]any)
			artifact := bundle["artifacts"].([]any)[0].(map[string]any)
			delete(artifact, field)
			changed, err := json.Marshal(document)
			require.NoError(t, err)
			_, err = readCheckpoint(bytes.NewReader(changed), identity, nil)
			require.ErrorContains(t, err, "missing complete-artifact field")
		})
	}
	for _, field := range []string{"file", "artifacts"} {
		t.Run("missing bundle "+field, func(t *testing.T) {
			t.Parallel()
			var document map[string]any
			require.NoError(t, json.Unmarshal(data, &document))
			bundle := document["bundles"].([]any)[0].(map[string]any)
			delete(bundle, field)
			changed, err := json.Marshal(document)
			require.NoError(t, err)
			_, err = readCheckpoint(bytes.NewReader(changed), identity, nil)
			require.ErrorContains(t, err, "missing bundle")
		})
	}
	var old map[string]any
	require.NoError(t, json.Unmarshal(data, &old))
	old["version"] = 1
	old["files"] = []CompleteFile{bundles[0].File}
	delete(old, "bundles")
	v1, err := json.Marshal(old)
	require.NoError(t, err)
	_, err = readCheckpoint(bytes.NewReader(v1), identity, nil)
	require.ErrorContains(t, err, "unsupported checkpoint version 1")
	duplicate := bytes.Replace(data, []byte(`"schema_version":1`), []byte(`"schema_version":1,"schema_version":1`), 1)
	_, err = readCheckpoint(bytes.NewReader(duplicate), identity, nil)
	require.ErrorContains(t, err, "duplicate JSON field")
}
