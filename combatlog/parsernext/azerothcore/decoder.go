package azerothcore

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// Decoder handles records only. Ordering, scanning and ACore synthetics stay
// with the caller; authoritative SPELL_ABSORBED records are decoded here.
type Decoder struct {
	core      *cleu.Decoder
	companion func(time.Time, string) ([]messages.Message, bool, error)
}

// NewDecoder requires the caller's resolved format and flavor, never deriving
// gameplay flavor from the ACore wire format.
func NewDecoder(ctx context.Context, logger *slog.Logger, hooks cleu.Hooks, resolveGear func([]combatant.GearItem)) (*Decoder, error) {
	metadata, ok := parsectx.FromContext(ctx)
	if !ok || metadata.Format != database.LogFormatAzerothcoreMod {
		return nil, fmt.Errorf("AzerothCore decoder requires explicit AzerothCore format")
	}
	lookup := func(id chrondbc.SpellID) *chrondbc.Spell {
		if id == 0 || hooks.LookupSpell == nil {
			return nil
		}
		return hooks.LookupSpell(id)
	}
	extensions := NewExtensions(logger, lookup, resolveGear)
	callerEvent := hooks.DecodeEvent
	hooks.DecodeEvent = func(ts time.Time, event string, fields cleu.Cursor, raw string) ([]messages.Message, bool, error) {
		if callerEvent != nil {
			msgs, handled, err := callerEvent(ts, event, fields, raw)
			if handled || err != nil {
				return msgs, handled, err
			}
		}
		return extensions.DecodeEvent(ts, event, fields, raw)
	}
	core, err := cleu.NewDecoder(cleu.Context{Format: metadata.Format, Flavor: metadata.Flavor}, hooks)
	if err != nil {
		return nil, err
	}
	return &Decoder{core: core, companion: hooks.DecodeCompanion}, nil
}

// Decode converts one raw Unix-millisecond record, preserving its timestamp.
func (d *Decoder) Decode(raw string) ([]messages.Message, error) {
	token, payload, err := cleu.SplitHeader(raw)
	if err != nil {
		return nil, err
	}
	millis, err := strconv.ParseInt(token, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parsing unix millis %q: %w", token, err)
	}
	ts := time.UnixMilli(millis)
	if d.companion != nil {
		msgs, handled, err := d.companion(ts, payload)
		if handled || err != nil {
			return msgs, err
		}
	}
	event, fields, err := cleu.ParsePayload(payload)
	if err != nil {
		return nil, err
	}
	return d.core.Decode(ts, event, cleu.NewFields(fields), raw)
}

// DecodeFields decodes a source-owned cursor. The source can observe its final
// error even when an extension intentionally logs and returns no messages.
func (d *Decoder) DecodeFields(ts time.Time, event string, cursor cleu.Cursor, raw string) ([]messages.Message, error) {
	return d.core.Decode(ts, event, cursor, raw)
}
