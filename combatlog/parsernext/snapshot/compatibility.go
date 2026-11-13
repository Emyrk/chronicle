package snapshot

import (
	"context"
	"encoding/hex"
	"fmt"
	"strings"
)

// Compatibility identifies the exact executable and dataset used to construct
// runtime owners. DatasetRevision is a positive monotonic content revision, not
// a UUID-only equivalence assertion. BuildIdentity is an executable SHA256.
// Runtime composition must obtain these values from authoritative metadata and
// the running binary; snapshot payloads must never supply construction identity.
type Compatibility struct {
	DatasetID       string `json:"dataset_id"`
	DatasetRevision int64  `json:"dataset_revision"`
	BuildIdentity   string `json:"build_identity"`
	Format          string `json:"format"`
	Flavor          string `json:"flavor"`
}

func (c Compatibility) Validate() error {
	id := c.DatasetID
	if len(id) != 36 || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		return fmt.Errorf("canonical nonzero dataset UUID required")
	}
	compact := strings.ReplaceAll(id, "-", "")
	decoded, err := hex.DecodeString(compact)
	if err != nil || len(decoded) != 16 || strings.ToLower(id) != id || compact == strings.Repeat("0", 32) {
		return fmt.Errorf("canonical nonzero dataset UUID required")
	}
	if c.DatasetRevision <= 0 {
		return fmt.Errorf("positive dataset revision required")
	}
	digest := strings.TrimPrefix(c.BuildIdentity, "sha256:")
	if len(digest) != 64 || c.BuildIdentity != "sha256:"+digest || strings.ToLower(digest) != digest {
		return fmt.Errorf("canonical executable sha256 identity required")
	}
	if _, err := hex.DecodeString(digest); err != nil {
		return fmt.Errorf("invalid executable sha256 identity: %w", err)
	}
	if strings.TrimSpace(c.Format) == "" || c.Format != strings.TrimSpace(c.Format) || strings.TrimSpace(c.Flavor) == "" || c.Flavor != strings.TrimSpace(c.Flavor) {
		return fmt.Errorf("explicit format and flavor required")
	}
	return nil
}

// Check rejects any mismatch before owners or external dependencies are restored.
func (c Compatibility) Check(actual Compatibility) error {
	if err := c.Validate(); err != nil {
		return err
	}
	if err := actual.Validate(); err != nil {
		return err
	}
	if c != actual {
		return fmt.Errorf("incompatible snapshot identity; retry with current dataset and executable")
	}
	return nil
}

type compatibilityKey struct{}

// WithCompatibility binds an immutable value to runtime construction. Owners
// validate it against their format/flavor and dataset context before using it.
func WithCompatibility(ctx context.Context, identity Compatibility) context.Context {
	return context.WithValue(ctx, compatibilityKey{}, identity)
}
func FromContext(ctx context.Context) (Compatibility, bool) {
	identity, ok := ctx.Value(compatibilityKey{}).(Compatibility)
	return identity, ok
}
