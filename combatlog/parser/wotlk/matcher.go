package wotlk

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	nexttbc "github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	nextwotlk "github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// dispatch preserves the legacy parser entry point while parsernext owns CLEU
// record semantics. Scanning, timestamps, ordering, companions, synthetics, and
// event-hook lifecycle remain owned by Parser.
func (p *Parser) dispatch(ts time.Time, event string, matched *Matched, raw string) ([]messages.Message, error) {
	if !p.parsernextSemantics {
		return p.legacyDispatch(ts, event, matched, raw)
	}
	if p.semantic == nil {
		decoder, err := p.newSemanticDecoder()
		if err != nil {
			return nil, err
		}
		p.semantic = decoder
	}
	return p.semantic.Decode(ts, event, matched, raw)
}

func (p *Parser) newSemanticDecoder() (*cleu.Decoder, error) {
	hooks := cleu.Hooks{
		LookupSpell: p.lookupSpell,
		RecordGUIDName: func(id guid.GUID, name string) {
			if p.guidNames != nil {
				p.guidNames.Record(id, name)
			}
		},
		DecodeEvent: func(ts time.Time, event string, cursor cleu.Cursor, raw string) ([]messages.Message, bool, error) {
			hook, ok := p.eventHook[event]
			if !ok {
				return nil, false, nil
			}
			legacy, ok := cursor.(*Matched)
			if !ok {
				return nil, true, fmt.Errorf("legacy event hook received %T cursor", cursor)
			}
			decoded, err := hook(ts, legacy, raw)
			return decoded, true, err
		},
		DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
			if !companion.IsCompanionMessage(payload) {
				return nil, false, nil
			}
			if p.companion == nil {
				p.companion = companion.New(p.logger)
			}
			decoded, err := p.companion.Feed(ts, payload)
			if err == nil {
				p.SetRealmClockInfo(p.companion.RealmClockInfo())
			}
			return decoded, true, err
		},
		WarnUnparsed: func(raw string) {
			if p.logger != nil {
				p.logger.Warn("Unparsed line", slog.String("line", raw))
			}
		},
	}
	switch p.parsernextExpansion {
	case nexttbc.Name:
		return nexttbc.NewDecoder(nexttbc.DecoderContext{Format: p.format, Flavor: p.flavor}, hooks)
	case nextwotlk.Name:
		return nextwotlk.NewDecoder(nextwotlk.DecoderContext{Format: p.format, Flavor: p.flavor}, hooks)
	default:
		return nil, fmt.Errorf("unsupported parsernext expansion %q", p.parsernextExpansion)
	}
}

// lookupSpell treats absent DBC rows as incomplete reference data rather than
// failing the record. Names from the wire remain diagnostic evidence.
func (p *Parser) lookupSpell(id chrondbc.SpellID, names ...string) *chrondbc.Spell {
	if id == 0 || p.wowDB == nil {
		return nil
	}
	spell, err := p.wowDB.Spell(context.Background(), id)
	if err == nil {
		return spell
	}
	entry := p.missedSpells[id]
	entry.Count++
	if entry.Name == "" && len(names) > 0 {
		entry.Name = names[0]
	}
	if p.missedSpells != nil {
		p.missedSpells[id] = entry
	}
	return nil
}
