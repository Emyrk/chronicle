package chronicle

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// Version 2 binds ordered artifacts to their caller-associated complete files.
// Version 1 was unshipped and has no migration or implied compatibility.
const checkpointVersion = 2
const maxCheckpointBytes = 256 << 20

// CompleteFile identifies immutable, decompressed input bytes, not append parts.
// SHA256 is lowercase hex; ID must uniquely identify the file in this session.
type CompleteFile struct {
	ID     string `json:"id"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// SessionCompatibility includes all caller-owned semantic policy identities.
// Display build tags alone are not executable identities.
type SessionCompatibility struct {
	Source       nextsource.Compatibility `json:"source"`
	Recipe       string                   `json:"recipe"`
	Policy       string                   `json:"policy"`
	IdentityMode bool                     `json:"identity_mode"`
	Realm        string                   `json:"realm"`
}

func (c SessionCompatibility) validate() error {
	if err := c.Source.RuntimeIdentity().Validate(); err != nil {
		return err
	}
	if c.Source.CustomOverrideVersion == "" || c.Recipe == "" || c.Policy == "" {
		return fmt.Errorf("incomplete session compatibility")
	}
	return nil
}
func validateCompleteFiles(files []CompleteFile) error {
	seen := map[string]bool{}
	for _, f := range files {
		hash, err := hex.DecodeString(f.SHA256)
		if f.ID == "" || seen[f.ID] || f.Size < 0 || err != nil || len(hash) != sha256.Size || hex.EncodeToString(hash) != f.SHA256 {
			return fmt.Errorf("invalid or duplicate complete-file descriptor %q", f.ID)
		}
		seen[f.ID] = true
	}
	return nil
}

type checkpointEnvelope struct {
	Version       uint32               `json:"version"`
	Compatibility SessionCompatibility `json:"compatibility"`
	Bundles       []CompleteBundle     `json:"bundles"`
	Graph         ownergraph.Snapshot  `json:"graph"`
}

// strictCheckpointJSON rejects duplicate keys at every nesting level, not just
// unknown struct fields. Duplicate compatibility keys must never be last-wins.
func strictCheckpointJSON(data []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(data))
	var walk func() error
	walk = func() error {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		delim, ok := tok.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				key, err := d.Token()
				if err != nil {
					return err
				}
				k, ok := key.(string)
				if !ok || seen[k] {
					return fmt.Errorf("duplicate JSON field %v", key)
				}
				seen[k] = true
				if err := walk(); err != nil {
					return err
				}
			}
		case '[':
			for d.More() {
				if err := walk(); err != nil {
					return err
				}
			}
		default:
			return fmt.Errorf("unexpected JSON delimiter")
		}
		_, err = d.Token()
		return err
	}
	if err := walk(); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing checkpoint data")
	}
	d = json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	return d.Decode(out)
}

// readCheckpoint treats the checkpoint as authoritative historical provenance.
// bundles contains only FUTURE input, never a historical manifest to reconcile.
// Validate saved descriptors structurally and reject replayed IDs, without
// looking up historical files/artifacts or comparing them to caller descriptors.
// Compatibility and provenance validation precede dependency/graph restoration.
func readCheckpoint(input io.Reader, expected SessionCompatibility, bundles []CompleteBundle) (checkpointEnvelope, error) {
	var env checkpointEnvelope
	if input == nil {
		return env, fmt.Errorf("checkpoint reader required")
	}
	if err := expected.validate(); err != nil {
		return env, err
	}
	if err := validateCompleteBundles(bundles); err != nil {
		return env, err
	}
	data, err := io.ReadAll(io.LimitReader(input, maxCheckpointBytes+1))
	if err != nil {
		return env, err
	}
	if len(data) > maxCheckpointBytes {
		return env, fmt.Errorf("checkpoint exceeds size limit")
	}
	// Decode only the version header before strict envelope decoding so old v1
	// archives receive an explicit version rejection, never a silent conversion.
	var header struct {
		Version uint32 `json:"version"`
	}
	if err := json.Unmarshal(data, &header); err != nil {
		return env, err
	}
	if header.Version != checkpointVersion {
		return env, fmt.Errorf("unsupported checkpoint version %d (expected %d)", header.Version, checkpointVersion)
	}
	if err := strictCheckpointJSON(data, &env); err != nil {
		return env, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return env, err
	}
	for _, name := range []string{"version", "compatibility", "bundles", "graph"} {
		if len(fields[name]) == 0 || bytes.Equal(fields[name], []byte("null")) {
			return env, fmt.Errorf("missing checkpoint field %s", name)
		}
	}
	var compatibility map[string]json.RawMessage
	if err := json.Unmarshal(fields["compatibility"], &compatibility); err != nil {
		return env, err
	}
	for _, name := range []string{"source", "recipe", "policy", "identity_mode", "realm"} {
		if len(compatibility[name]) == 0 || bytes.Equal(compatibility[name], []byte("null")) {
			return env, fmt.Errorf("missing compatibility field %s", name)
		}
	}
	var source map[string]json.RawMessage
	if err := json.Unmarshal(compatibility["source"], &source); err != nil {
		return env, err
	}
	for _, name := range []string{"dataset_id", "dataset_revision", "build_identity", "format", "flavor", "build_version", "custom_override_version"} {
		if len(source[name]) == 0 || bytes.Equal(source[name], []byte("null")) {
			return env, fmt.Errorf("missing source compatibility field %s", name)
		}
	}
	var bundleFields []map[string]json.RawMessage
	if err := json.Unmarshal(fields["bundles"], &bundleFields); err != nil {
		return env, err
	}
	for _, bundle := range bundleFields {
		if len(bundle["file"]) == 0 || bytes.Equal(bundle["file"], []byte("null")) {
			return env, fmt.Errorf("missing bundle file")
		}
		// A present null/empty artifacts value both represent no associated artifacts.
		// Missing the field is not accepted, to avoid silently dropping association.
		if len(bundle["artifacts"]) == 0 {
			return env, fmt.Errorf("missing bundle artifacts")
		}
		var file map[string]json.RawMessage
		if err := json.Unmarshal(bundle["file"], &file); err != nil {
			return env, err
		}
		for _, name := range []string{"id", "size", "sha256"} {
			if len(file[name]) == 0 || bytes.Equal(file[name], []byte("null")) {
				return env, fmt.Errorf("missing complete-file field %s", name)
			}
		}
		var artifacts []map[string]json.RawMessage
		if err := json.Unmarshal(bundle["artifacts"], &artifacts); err != nil {
			return env, err
		}
		for _, artifact := range artifacts {
			for _, name := range []string{"id", "kind", "schema_version", "size", "sha256"} {
				if len(artifact[name]) == 0 || bytes.Equal(artifact[name], []byte("null")) {
					return env, fmt.Errorf("missing complete-artifact field %s", name)
				}
			}
		}
	}
	if env.Version != checkpointVersion || env.Compatibility != expected {
		return env, fmt.Errorf("checkpoint version or compatibility mismatch")
	}
	if len(env.Bundles) == 0 {
		return env, fmt.Errorf("checkpoint has no completed bundle provenance")
	}
	if err := validateCompleteBundles(env.Bundles); err != nil {
		return env, err
	}
	seenFiles := make(map[string]bool, len(env.Bundles))
	seenArtifacts := make(map[string]bool)
	for _, completed := range env.Bundles {
		seenFiles[completed.File.ID] = true
		for _, artifact := range completed.Artifacts {
			seenArtifacts[artifact.ID] = true
		}
	}
	for _, future := range bundles {
		if seenFiles[future.File.ID] {
			return env, fmt.Errorf("future file %q already completed in checkpoint", future.File.ID)
		}
		for _, artifact := range future.Artifacts {
			if seenArtifacts[artifact.ID] {
				return env, fmt.Errorf("future artifact %q already completed in checkpoint", artifact.ID)
			}
		}
	}
	return env, nil
}

// CheckpointDurabilityError means checkpoint replacement passed the rename commit
// point: Path contains the new checkpoint, but syncing its directory failed, so
// crash durability is unknown. It does NOT mean the previous checkpoint remains
// in place. Callers should inspect/verify Path and choose their recovery action;
// retry by restoring a verified checkpoint, not by reusing an invalidated session.
// Use errors.As to distinguish this outcome from pre-commit failures.
type CheckpointDurabilityError struct {
	Path string
	Err  error
}

func (e *CheckpointDurabilityError) Error() string {
	return fmt.Sprintf("checkpoint %q replaced, but crash durability is unknown: %v", e.Path, e.Err)
}

func (e *CheckpointDurabilityError) Unwrap() error { return e.Err }

// checkpointFileOps is a per-call fault-injection seam, not a process-global
// filesystem override. Production always uses the local OS operations below.
type checkpointFileOps struct {
	write         func(*os.File, []byte) (int, error)
	syncFile      func(*os.File) error
	rename        func(string, string) error
	syncDirectory func(*os.File) error
}

// replaceCheckpoint assumes a Unix-style local filesystem with atomic rename
// replacement and file/directory fsync support. The temporary file is a sibling
// of path so rename does not cross filesystems. Concurrent checkpoint publishers
// must be serialized by the caller. Network/remote filesystem guarantees are not
// established by this helper.
//
// Every failure before rename leaves the previously published checkpoint intact.
// After rename, a directory sync failure returns *CheckpointDurabilityError:
// replacement is visible, crash durability is unknown, and no rollback is tried.
func replaceCheckpoint(path string, data []byte) error {
	return replaceCheckpointWithOps(path, data, checkpointFileOps{
		write:         (*os.File).Write,
		syncFile:      (*os.File).Sync,
		rename:        os.Rename,
		syncDirectory: (*os.File).Sync,
	})
}

func replaceCheckpointWithOps(path string, data []byte, ops checkpointFileOps) error {
	if len(data) > maxCheckpointBytes {
		return fmt.Errorf("checkpoint exceeds size limit")
	}
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer func() { _ = dir.Close() }()
	tmp, err := os.CreateTemp(filepath.Dir(path), ".chronicle-checkpoint-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	n, err := ops.write(tmp, data)
	if err == nil && n != len(data) {
		err = io.ErrShortWrite
	}
	if err != nil {
		_ = tmp.Close()
		return err
	}
	if err = ops.syncFile(tmp); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = ops.rename(tmp.Name(), path); err != nil {
		return err
	}
	// The commit point has passed. Do not attempt to restore the previous file.
	if err = ops.syncDirectory(dir); err != nil {
		return &CheckpointDurabilityError{Path: path, Err: err}
	}
	return nil
}
