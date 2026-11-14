package chronicle

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/sidekickstorage"
)

// bundleSidekickSource preserves caller-supplied artifact order. Like the worker,
// it decodes only one artifact at a time and leaves timestamp merging to Inserter.
// It is exhausted before a bundle becomes checkpointable, so no cursor escapes
// into the durable ownergraph. Consumer-retained messages remain graph owners.
type bundleSidekickSource struct {
	inputs              []BundleArtifactInput
	next                int
	current             *sidekickstorage.Source
	resources, position bool
}

func (s *bundleSidekickSource) Advance(ctx context.Context) ([]messages.Message, error) {
	for {
		if err := ctx.Err(); err != nil {
			return nil, parseerrors.AsFatalError(err)
		}
		if s.current != nil {
			batch, err := s.current.Advance(ctx)
			if err == nil {
				return batch, nil
			}
			if err != io.EOF {
				return nil, parseerrors.AsFatalError(err)
			}
			s.current = nil
			if len(batch) > 0 {
				return batch, nil
			}
		}
		if s.next == len(s.inputs) {
			return nil, io.EOF
		}
		input := s.inputs[s.next]
		s.next++
		hash := sha256.New()
		counter := &checkpointCountingReader{r: io.TeeReader(input.Input, hash)}
		decoded, err := (sidekickstorage.Decoder{}).Decode(ctx, counter)
		if err != nil {
			return nil, parseerrors.AsFatalError(fmt.Errorf("artifact %s: %w", input.Artifact.ID, err))
		}
		if counter.n != input.Artifact.Size || hex.EncodeToString(hash.Sum(nil)) != input.Artifact.SHA256 {
			return nil, parseerrors.AsFatalError(fmt.Errorf("artifact %s content mismatch", input.Artifact.ID))
		}
		source, ok := decoded.(*sidekickstorage.Source)
		if !ok || source.SchemaVersion() != input.Artifact.SchemaVersion {
			return nil, parseerrors.AsFatalError(fmt.Errorf("artifact %s schema mismatch", input.Artifact.ID))
		}
		s.resources = s.resources || source.SawUnitResources()
		s.position = s.position || source.SawUnitPosition()
		s.current = source
	}
}

// Other worker formats do not consume Sidekick messages. Verify the explicitly
// supplied immutable input nevertheless, without giving it gameplay semantics.
func verifyIgnoredArtifacts(ctx context.Context, inputs []BundleArtifactInput) error {
	for _, input := range inputs {
		if err := ctx.Err(); err != nil {
			return err
		}
		hash := sha256.New()
		n, err := io.Copy(hash, io.LimitReader(input.Input, input.Artifact.Size+1))
		if err != nil {
			return fmt.Errorf("artifact %s: %w", input.Artifact.ID, err)
		}
		if n != input.Artifact.Size || hex.EncodeToString(hash.Sum(nil)) != input.Artifact.SHA256 {
			return fmt.Errorf("artifact %s content mismatch", input.Artifact.ID)
		}
	}
	return nil
}
