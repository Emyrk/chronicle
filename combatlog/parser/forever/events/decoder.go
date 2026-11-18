// Package events decodes retained Sidekick Forever events artifacts. It does not
// correlate players, apply scouting observations, or generate combat-log events.
package events

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/internal/luadata"
)

const (
	MaxArtifactBytes = 8 << 20
	MaxSources       = 64
	MaxMetadataBytes = 4096
)

// Artifact contains independent account snapshots, in the supplied source order.
// Unknown collections remain literal data. Consumers must explicitly opt into a
// known collection; decoding alone must not apply enrichment or execute Lua.
type Artifact struct {
	SchemaVersion int
	Kind          string
	Sources       []Source
}

// Source identifies a snapshot, not a character. Path is untrusted metadata
// relative to the client's installation, never a server filesystem path.
type Source struct {
	Account     string
	Path        string
	Collections luadata.Value
}

type envelope struct {
	SchemaVersion int    `json:"schema_version"`
	Kind          string `json:"kind"`
	Sources       []struct {
		Account        string  `json:"account"`
		Source         string  `json:"source"`
		CollectionsLua *string `json:"collections_lua"`
	} `json:"sources"`
}

// Decode reads a v1 sidekick-events envelope and its restricted Lua table
// expressions. JSON decoding is the only transport unescaping step. This is an
// interpretation boundary, not upload validation: opaque uploads stay lenient
// and the original stored file remains authoritative for future decoders.
func Decode(ctx context.Context, reader io.Reader) (*Artifact, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(io.LimitReader(reader, MaxArtifactBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read Forever events: %w", err)
	}
	if len(data) > MaxArtifactBytes {
		return nil, fmt.Errorf("forever events exceeds %d bytes", MaxArtifactBytes)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !utf8.Valid(data) {
		return nil, fmt.Errorf("forever events must contain valid UTF-8 JSON")
	}
	var wire envelope
	if err := json.Unmarshal(data, &wire); err != nil {
		return nil, fmt.Errorf("decode Forever events JSON: %w", err)
	}
	if wire.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported Forever events schema_version %d", wire.SchemaVersion)
	}
	if wire.Kind != "sidekick-events" {
		return nil, fmt.Errorf("unsupported Forever events kind %q", wire.Kind)
	}
	if wire.Sources == nil {
		return nil, fmt.Errorf("forever events sources must be an array")
	}
	if len(wire.Sources) > MaxSources {
		return nil, fmt.Errorf("forever events source count exceeds %d", MaxSources)
	}
	artifact := &Artifact{SchemaVersion: wire.SchemaVersion, Kind: wire.Kind, Sources: make([]Source, 0, len(wire.Sources))}
	for i, source := range wire.Sources {
		if source.Account == "" || len(source.Account) > MaxMetadataBytes {
			return nil, fmt.Errorf("source %d: account must contain 1 to %d bytes", i, MaxMetadataBytes)
		}
		if source.Source == "" || len(source.Source) > MaxMetadataBytes {
			return nil, fmt.Errorf("source %d: source must contain 1 to %d bytes", i, MaxMetadataBytes)
		}
		if source.CollectionsLua == nil {
			return nil, fmt.Errorf("source %d: collections_lua must be a string", i)
		}
		collections, err := luadata.ParseTable(ctx, *source.CollectionsLua)
		if err != nil {
			return nil, fmt.Errorf("source %d: parse collections_lua: %w", i, err)
		}
		artifact.Sources = append(artifact.Sources, Source{Account: source.Account, Path: source.Source, Collections: collections})
	}
	return artifact, nil
}
