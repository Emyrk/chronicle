package chronicle

import (
	"fmt"
	"io"
	"slices"
)

// CompleteArtifact identifies immutable, decompressed artifact bytes explicitly
// associated by the caller with one complete log file. SchemaVersion describes
// the artifact schema, not the checkpoint envelope. SHA256 is lowercase hex.
type CompleteArtifact struct {
	ID            string `json:"id"`
	Kind          string `json:"kind"`
	SchemaVersion int32  `json:"schema_version"`
	Size          int64  `json:"size"`
	SHA256        string `json:"sha256"`
}

// CompleteBundle records caller-defined file/artifact association and ordering.
// It performs no storage lookup, chunk inference, or database selection.
type CompleteBundle struct {
	File      CompleteFile       `json:"file"`
	Artifacts []CompleteArtifact `json:"artifacts"`
}

// BundleArtifactInput supplies the already decompressed bytes for an artifact. The
// caller owns the reader and its lifetime; descriptors do not encode availability.
type BundleArtifactInput struct {
	Artifact CompleteArtifact
	Input    io.Reader
}

// FileBundle supplies one complete log and its explicitly associated artifacts.
// Readers are runtime-only and are never serialized into a checkpoint.
type FileBundle struct {
	File      CompleteFile
	Input     io.Reader
	Artifacts []BundleArtifactInput
}

func cloneCompleteBundles(bundles []CompleteBundle) []CompleteBundle {
	result := slices.Clone(bundles)
	for i := range result {
		result[i].Artifacts = slices.Clone(result[i].Artifacts)
	}
	return result
}

// Nil and empty artifact lists both identify an artifact-free bundle.
func equalCompleteBundle(a, b CompleteBundle) bool {
	return a.File == b.File && slices.Equal(a.Artifacts, b.Artifacts)
}

func validateCompleteBundles(bundles []CompleteBundle) error {
	files := make([]CompleteFile, len(bundles))
	seenArtifacts := make(map[string]bool)
	for i, bundle := range bundles {
		files[i] = bundle.File
		for _, artifact := range bundle.Artifacts {
			if artifact.Size < 0 || artifact.Size > 8<<20 {
				return fmt.Errorf("complete-artifact size outside decoder limit for %q", artifact.ID)
			}
			if artifact.Kind != ArtifactKindSidekickStorage || artifact.SchemaVersion < 1 || artifact.SchemaVersion > 3 {
				return fmt.Errorf("unsupported complete-artifact kind/schema for %q", artifact.ID)
			}
			// Artifacts use the same immutable decompressed-byte identity requirements.
			if err := validateCompleteFiles([]CompleteFile{{ID: artifact.ID, Size: artifact.Size, SHA256: artifact.SHA256}}); err != nil {
				return fmt.Errorf("invalid complete-artifact descriptor: %w", err)
			}
			if seenArtifacts[artifact.ID] {
				return fmt.Errorf("duplicate complete-artifact ID %q", artifact.ID)
			}
			seenArtifacts[artifact.ID] = true
		}
	}
	return validateCompleteFiles(files)
}
