package stategraph

import (
	"context"
	"encoding/json"
	"fmt"
)

// ValuePayload is the semantic content of a canonical Value, separate from its
// optional debug metadata. This is not an archive or persistence envelope.
type ValuePayload struct {
	Type    string          `json:"type"`
	Version uint32          `json:"version"`
	Payload json.RawMessage `json:"payload"`
}

// DerivableType is a trusted, caller-constructed registration. Derivable marks
// values whose payload is a lookup key rather than serialized runtime state.
// Bind the resolver and its compatible session context once at construction.
// One registration handles one concrete runtime type; no global locator is used.
type DerivableType[T any] struct {
	Type      string
	Version   uint32
	Derivable bool
	Derive    func(context.Context, json.RawMessage) (T, error)
}

// Restore derives each canonical Value once, then resolves direct references to
// that same result. This bounded graph must contain only this registered value
// type plus directories/references. No partially resolved result escapes failure.
// Session compatibility must be checked by the caller before invoking Restore.
func (r DerivableType[T]) Restore(ctx context.Context, g Graph, payloads map[Path]ValuePayload) (map[Path]T, error) {
	if !r.Derivable || r.Type == "" || r.Version == 0 || r.Derive == nil {
		return nil, fmt.Errorf("invalid derivable registration")
	}
	validated, err := g.validated()
	if err != nil {
		return nil, err
	}
	values := 0
	// Validate all record associations before calling any external resolver.
	for _, node := range validated.Nodes {
		switch node.Kind {
		case KindValue:
			values++
			p, ok := payloads[node.Path]
			if !ok || node.Type != r.Type || p.Type != r.Type || p.Version != r.Version {
				return nil, fmt.Errorf("missing or incompatible value payload at %s", node.Path)
			}
		case KindReference:
			if node.Type != r.Type {
				return nil, fmt.Errorf("incompatible reference type at %s", node.Path)
			}
		}
	}
	if len(payloads) != values {
		return nil, fmt.Errorf("unexpected value payloads")
	}
	result := make(map[Path]T, len(validated.Nodes))
	for _, node := range validated.Nodes {
		if node.Kind != KindValue {
			continue
		}
		value, err := r.Derive(ctx, payloads[node.Path].Payload)
		if err != nil {
			return nil, fmt.Errorf("derive %s: %w", node.Path, err)
		}
		result[node.Path] = value
	}
	for _, node := range validated.Nodes {
		if node.Kind == KindReference {
			result[node.Path] = result[node.Target]
		}
	}
	return result, nil
}
