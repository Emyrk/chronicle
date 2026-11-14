package modern

import (
	"context"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
)

// Normalizer owns one explicitly selected wire format's GUID/name/layout state.
// It does not decode messages, run synthetics or choose downstream consumers.
// Reuse explicitly retains state across files; EOF does not finalize it.
type Normalizer struct {
	transform *TransformReader
	format    database.LogFormat
	flavor    database.WoWFlavor
}

// NewNormalizer requires resolved Format and Flavor. Header fields may change
// wire layout/version but never supply or infer the caller's server flavor.
func NewNormalizer(ctx context.Context) (*Normalizer, error) {
	format, ok := parsectx.Format(ctx)
	flavor, hasFlavor := parsectx.Flavor(ctx)
	if !ok || format == "" || !hasFlavor || len(flavor) == 0 {
		return nil, fmt.Errorf("modern normalization requires explicit parsectx format and flavor")
	}
	var reader *TransformReader
	switch format {
	case database.LogFormatHermesproxy1142Cc:
		reader = NewHermesProxyTransformReader(strings.NewReader(""))
	case database.LogFormatV9Cleu, database.LogFormatV22Cleu:
		reader = NewTransformReader(strings.NewReader(""))
	default:
		return nil, fmt.Errorf("unsupported modern normalization format %q", format)
	}
	return &Normalizer{transform: reader, format: format, flavor: append(database.WoWFlavor(nil), flavor...)}, nil
}

// Normalize preserves the legacy normalized text exactly, including ordered
// telemetry records separated by newlines. Empty output is the existing wire
// normalizer outcome (e.g. EMOTE), not a claim of a decoded combat message.
// The upcoming CLEU message decoder consumes this boundary without an old parser.
func (n *Normalizer) Normalize(line string) (string, error) { return n.transform.Transform(line) }
func (n *Normalizer) GUIDMappings() []GUIDMapping           { return n.transform.guids.Mappings() }
func (n *Normalizer) Format() database.LogFormat            { return n.format }
func (n *Normalizer) Flavor() database.WoWFlavor            { return append(database.WoWFlavor(nil), n.flavor...) }
