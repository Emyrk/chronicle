package modern

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
)

// DecoderOptions supplies dataset/companion/name integration; none runs synthetics.
type DecoderOptions struct {
	Spells SpellLookup
	Hooks  cleu.Hooks
}

// Decoder composes modern normalization and metadata with shared CLEU semantics.
// It owns no reader, timestamp ordering, synthetic pipeline or consumers.
type Decoder struct {
	normalizer *Normalizer
	handlers   *HandlerState
	core       *cleu.Decoder
}

func NewDecoder(ctx context.Context, options DecoderOptions) (*Decoder, error) {
	n, err := NewNormalizer(ctx)
	if err != nil {
		return nil, err
	}
	if options.Spells == nil {
		return nil, fmt.Errorf("modern decoder spell lookup is required")
	}
	if options.Hooks.LookupSpell == nil {
		return nil, fmt.Errorf("modern decoder CLEU spell lookup hook is required")
	}
	if n.format == database.LogFormatHermesproxy1142Cc && options.Hooks.DecodeCompanion == nil {
		return nil, fmt.Errorf("HermesProxy companion hook is required")
	}
	_, trees := parsectx.DatasetTalents(ctx)
	version := 9
	if n.format == database.LogFormatV22Cleu {
		version = 22
	}
	d := &Decoder{normalizer: n, handlers: &HandlerState{Version: version, Spells: options.Spells, TalentTrees: trees, Flavor: n.Flavor(), GUIDs: n.transform.guids}}
	hooks := options.Hooks
	fallback := hooks.DecodeEvent
	hooks.DecodeEvent = func(ts time.Time, event string, m cleu.Cursor, raw string) ([]messages.Message, bool, error) {
		handler := d.handlers.handler(event)
		if handler == nil {
			if fallback != nil {
				return fallback(ts, event, m, raw)
			}
			return nil, false, nil
		}
		cursor, ok := m.(Cursor)
		if !ok {
			return nil, true, fmt.Errorf("modern handler requires extended field cursor")
		}
		result, err := handler(ts, cursor, raw)
		return result, true, err
	}
	d.core, err = cleu.NewDecoder(cleu.Context{Format: n.format, Flavor: n.Flavor()}, hooks)
	if err != nil {
		return nil, err
	}
	return d, nil
}

// DecodeLine uses the caller's resolved timestamp for this physical record and
// its emitted telemetry, preserving event-before-telemetry order. The source
// layer must preserve base-year/timezone and V22 regression policies separately.
func (d *Decoder) DecodeLine(ts time.Time, line string) ([]messages.Message, error) {
	var result []messages.Message
	err := d.DecodeLineEach(ts, line, func(batch []messages.Message) error { result = append(result, batch...); return nil })
	return result, err
}

// DecodeLineEach retains the legacy normalized-record batch boundaries. The
// caller can run its synthetic pipeline for each emitted batch before the next
// normalized telemetry record, without the decoder owning that pipeline.
func (d *Decoder) DecodeLineEach(ts time.Time, line string, emit func([]messages.Message) error) error {
	records, err := d.NormalizeLine(line)
	if err != nil {
		return err
	}
	for _, record := range records {
		batch, err := d.DecodeNormalized(ts, record)
		if err != nil {
			return err
		}
		if err = emit(batch); err != nil {
			return err
		}
	}
	return nil
}

// NormalizeLine preserves ordered normalized records for a pull source to queue.
func (d *Decoder) NormalizeLine(line string) ([]string, error) {
	normalized, err := d.normalizer.Normalize(line)
	if err != nil {
		return nil, err
	}
	if normalized == "" {
		return nil, nil
	}
	return strings.Split(normalized, "\n"), nil
}

// DecodeNormalized decodes exactly one normalized record without synthetics.
func (d *Decoder) DecodeNormalized(ts time.Time, record string) ([]messages.Message, error) {
	_, event, fields, err := cleu.ParseLine(record)
	if err != nil {
		return nil, err
	}
	cursor := cleu.NewFields(fields)
	batch, err := d.core.Decode(ts, event, cursor, record)
	if err == nil {
		err = cursor.Error()
	}
	return batch, err
}

func (d *Decoder) GUIDMappings() []GUIDMapping { return d.normalizer.GUIDMappings() }
func (s *HandlerState) handler(event string) func(time.Time, Cursor, string) ([]messages.Message, error) {
	switch event {
	case "BLIZZARD_COMBAT_LOG_VERSION":
		return s.CombatLogVersion
	case "BLIZZARD_ZONE_CHANGE":
		return s.ZoneChange
	case "BLIZZARD_COMBATANT_INFO":
		return s.CombatantInfo
	case "BLIZZARD_SPELL_ABSORBED":
		return s.SpellAbsorbed
	case "BLIZZARD_UNIT_OWNER":
		return s.UnitOwner
	case "BLIZZARD_UNIT_POSITION":
		return s.UnitPosition
	case "BLIZZARD_UNIT_RESOURCES":
		return s.UnitResources
	case "BLIZZARD_ENCOUNTER_START":
		return s.EncounterStart
	case "BLIZZARD_ENCOUNTER_END":
		return s.EncounterEnd
	case "BLIZZARD_WORLD_MARKER_PLACED":
		return s.WorldMarkerPlaced
	case "BLIZZARD_WORLD_MARKER_REMOVED":
		return s.WorldMarkerRemoved
	default:
		return nil
	}
}
