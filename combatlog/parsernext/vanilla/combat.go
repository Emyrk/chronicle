package vanilla

import (
	"context"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"time"
)

// SpellLookup preserves the legacy dataset-aware spell lookup boundary.
type SpellLookup interface {
	Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error)
}

// CombatFields is the narrow typed cursor used by both decoding entrypoints.
type CombatFields interface {
	Guid() guid.GUID
	Int64() int64
	Int32() int32
	SwingHitInfo() SwingHitInfo
	Error() error
}

func decoded(m ...messages.Message) ([]messages.Message, error) { return m, nil }
func DecodeSwing(ctx context.Context, spells SpellLookup, ts time.Time, m CombatFields) ([]messages.Message, error) {
	caster := m.Guid()
	target := m.Guid()
	amount := int32(m.Int64())
	info := m.SwingHitInfo()
	victimState := VictimState(m.Int64())
	components := m.Int32() // Number of damage components probably does not matter
	blocked := int32(m.Int64())
	absorbed := int32(m.Int64())
	resisted := int32(m.Int64())

	if err := m.Error(); err != nil {
		return nil, err
	}

	auto, err := spells.Spell(ctx, chrondbc.SpellIDAutoAttack)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			auto = ptr.Ref(chrondbc.UnknownSpell(chrondbc.SpellIDAutoAttack))
		} else {
			return nil, fmt.Errorf("fetching auto attack spell: %w", err)
		}
	}
	ht := HitType(amount, components, info, victimState)

	return decoded(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       ptr.Ref("Auto Attack"),
		SpellData:       auto,
		Caster:          ptr.Ref(caster),
		Target:          target,
		HitType:         ht,
		Amount:          amount,
		School:          types.PhysicalSchool,
		Trailer:         Trailer(blocked, absorbed, resisted),
		EnvironmentType: nil,
	})
}

func DecodeDeath(ts time.Time, m CombatFields) ([]messages.Message, error) {
	id := m.Guid()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var dmg *messages.Damage // For unit tests, this is dumb
	return decoded(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      id,
		Killer:      nil,
		Attribution: dmg,
	})
}
