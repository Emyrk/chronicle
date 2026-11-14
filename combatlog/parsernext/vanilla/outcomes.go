package vanilla

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// FailureFields preserves the client/server discriminator and optional flag.
type FailureFields interface {
	RecordFields
	Remain() int
	Bool() bool
}

func DecodeSpellFail(ctx context.Context, spells SpellLookup, ts time.Time, m FailureFields) ([]messages.Message, error) {
	if !strings.HasPrefix(strings.TrimSpace(m.Peek()), "0x") {
		// Intentional client-side drop: do not report or count it.
		return []messages.Message{}, nil
	}
	caster := m.Guid()
	if spells == nil {
		return nil, fmt.Errorf("SPELL_FAIL requires spell lookup")
	}
	spell := ReadSpell(ctx, spells, m)
	serverSide := true
	if m.Remain() > 0 {
		serverSide = m.Bool()
	}
	// The old advance validated consumed fields even on a client-side drop.
	if err := m.Error(); err != nil {
		return nil, err
	}
	if !serverSide {
		return []messages.Message{}, nil
	}
	return decoded(&messages.SpellFail{MessageBase: messages.Base(ts), SpellData: spell, Caster: caster, FailedByServer: true})
}

func DecodeAuraDuration(ts time.Time) ([]messages.Message, error) {
	return messages.Skip(ts, "aura duration update not implemented"), nil
}
