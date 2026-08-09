package companion

import (
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/internal/semverenc"
)

const vehicleTrackingAddonVersion = "0.6"

// Parser reassembles and decodes ChronicleCompanionWoTLK addon messages
// that are smuggled inside the failedType field of SPELL_CAST_FAILED events.
//
// Wire format:
//   - [N...payload...]  — start of message N (digit 0-9), ] closes
//   - ~...              — continuation of current message
//   - Multiple [N...] can be bin-packed in a single failedType field
type Parser struct {
	logger *slog.Logger

	// Framing reassembly state
	state          assemblyState
	buffer         strings.Builder
	counter        byte // last seen message counter digit (0-9)
	decodedOrdinal uint64

	// Player data accumulation — segments arrive independently,
	// so we build up per-player state over time.
	players map[guid.GUID]*PlayerData

	addonVersion string
	realmClock   *realmclock.Info
}

type assemblyState int

const (
	stateIdle assemblyState = iota
	stateAccumulating
)

// New creates a companion parser.
func New(logger *slog.Logger) *Parser {
	return &Parser{
		logger:  logger,
		players: make(map[guid.GUID]*PlayerData),
	}
}

func (p *Parser) supportsVehicleTracking() bool {
	return semverenc.Encode(p.addonVersion) >= semverenc.Encode(vehicleTrackingAddonVersion)
}

// RealmClockInfo returns the most recently parsed clock data from an extended
// companion header. Legacy six-field headers leave it nil.
func (p *Parser) RealmClockInfo() *realmclock.Info {
	return p.realmClock
}

// IsCompanionMessage returns true if the failedType string looks like a
// companion addon framed message (starts with [N or ~).
func IsCompanionMessage(s string) bool {
	if len(s) < 2 {
		return false
	}
	return (s[0] == '[' && s[1] >= '0' && s[1] <= '9') || s[0] == '~'
}

// Feed processes one failedType string from a SPELL_CAST_FAILED event.
// Returns zero or more parsed messages. Bin-packed fields can yield multiple.
func (p *Parser) Feed(ts time.Time, failedType string) ([]messages.Message, error) {
	var result []messages.Message
	pos := 0

	for pos < len(failedType) {
		ch := failedType[pos]

		switch {
		case ch == '[' && pos+1 < len(failedType) && failedType[pos+1] >= '0' && failedType[pos+1] <= '9':
			// New message start: [N
			if p.state == stateAccumulating {
				// Previous message was incomplete — discard it.
				p.logger.Debug("companion: discarding incomplete message",
					slog.String("counter", string(p.counter)),
				)
			}
			p.counter = failedType[pos+1]
			p.buffer.Reset()
			p.state = stateAccumulating
			pos += 2 // skip '[' and digit

			// Consume payload until ']' or end of string.
			msgs, advance := p.consumePayload(ts, failedType[pos:])
			pos += advance
			result = append(result, msgs...)

		case ch == '~':
			// Continuation of current message.
			if p.state != stateAccumulating {
				// Ignore the orphaned payload, but keep scanning this field. A later
				// bin-packed message can still be complete and independently useful.
				p.logger.Debug("companion: ignoring orphan continuation")
				pos++
				continue
			}
			pos++ // skip '~'

			// Consume remaining payload.
			msgs, advance := p.consumePayload(ts, failedType[pos:])
			pos += advance
			result = append(result, msgs...)

		default:
			// Not a companion message character at this position.
			pos++
		}
	}

	return result, nil
}

// consumePayload reads from data into the buffer until it hits ']' (message complete)
// or a new '[' (bin-packed next message) or end of string.
// Returns any completed messages and the number of bytes consumed.
func (p *Parser) consumePayload(ts time.Time, data string) ([]messages.Message, int) {
	var result []messages.Message

	for i := 0; i < len(data); i++ {
		ch := data[i]
		if ch == ']' {
			// Message complete.
			payload := p.buffer.String()
			p.buffer.Reset()
			p.state = stateIdle

			ordinal := p.decodedOrdinal
			p.decodedOrdinal++
			msgs, err := p.dispatch(ts, payload, ordinal)
			if err != nil {
				p.logger.Warn("companion: failed to parse message",
					slog.String("payload", payload),
					slog.String("error", err.Error()),
				)
			}
			result = append(result, msgs...)
			return result, i + 1 // +1 to skip ']'
		}
		if ch == '[' {
			// Start of a bin-packed next message — stop consuming for current.
			// Don't advance past '['; let the outer loop handle it.
			return result, i
		}
		p.buffer.WriteByte(ch)
	}

	// Reached end of string without ']'. Message is incomplete (multi-slot).
	return result, len(data)
}
