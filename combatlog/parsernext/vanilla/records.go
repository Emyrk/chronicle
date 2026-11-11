package vanilla

import (
	"context"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"strconv"
	"time"
)

// RecordFields extends the migration cursor with non-consuming lookahead and
// unchecked skipped fields, preserving legacy optional/ignored field behavior.
type RecordFields interface {
	SpellFields
	Peek() string
	Skip()
}

func DecodeAuraCast(ctx context.Context, spells SpellLookup, ts time.Time, m RecordFields) ([]messages.Message, error) {
	spell := ReadSpell(ctx, spells, m)
	caster := m.Guid()
	target := ReadOptionalGUID(m)
	effect := chrondbc.Effect(m.Int32())
	auraName := chrondbc.AuraEffect(m.Int32())
	amplitude := m.Int32()
	effectMiscValue := m.Int32()
	durationMS := m.Int32()
	capStatus := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	return decoded(&messages.AuraCast{
		MessageBase:     messages.Base(ts),
		Spell:           spell,
		Caster:          caster,
		Target:          target,
		Effect:          effect,
		Amplitude:       amplitude,
		EffectAuraName:  auraName,
		DurationMS:      durationMS,
		AuraCapStatus:   capStatus,
		EffectMiscValue: effectMiscValue,
	})
}

func DecodeEnergize(ctx context.Context, spells SpellLookup, ts time.Time, m RecordFields) ([]messages.Message, error) {
	target := m.Guid()
	caster := ReadOptionalGUID(m)
	spell := ReadSpell(ctx, spells, m)
	powerType := PowerTypeResource(m.Int32())
	amount := m.Int32()
	periodic := m.Int64() == 1

	var _ = periodic

	if err := m.Error(); err != nil {
		return nil, err
	}

	dir := types.ChangeDirectionGain
	if amount < 0 {
		dir = types.ChangeDirectionLoss
		amount = -amount
	}

	var name *string
	if spell != nil {
		name = ptr.Ref(spell.Name())
	}

	return decoded(&messages.ResourceChange{
		MessageBase: messages.Base(ts),
		Target:      target,
		Amount:      amount,
		Resource:    powerType,
		Caster:      caster,
		SpellName:   name,
		SpellData:   spell,
		Direction:   dir,
	})
}

func DecodeAura(ctx context.Context, spells SpellLookup, event string, ts time.Time, buff bool, m RecordFields) ([]messages.Message, error) {
	target := m.Guid()
	m.Skip() // buff slot
	spell := ReadSpell(ctx, spells, m)
	stack := m.Int32()
	m.Skip() // aura level
	m.Skip() // aura slot
	stateNum := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	spName := ""
	if spell != nil {
		spName = spell.Name()
	}

	var state = types.AuraStateUnknown
	switch stateNum {
	case 0:
		state = types.AuraStateAdded
	case 1:
		state = types.AuraStateRemoved
	case 2:
		switch event {
		case "BUFF_ADD", "DEBUFF_ADD":
			state = types.AuraStateAdded
		case "BUFF_REM", "DEBUFF_REM":
			state = types.AuraStateRemoved
		}
	}

	return decoded(&messages.Aura{
		MessageBase: messages.Base(ts),
		IsBuff:      buff,
		Target:      target,
		SpellName:   spName,
		SpellData:   spell,
		Amount:      stack,
		State:       state,
	})
}

func DecodeSpellGo(ctx context.Context, spells SpellLookup, ts time.Time, m RecordFields) ([]messages.Message, error) {
	itemID := m.Int32() // 0 if no item triggered it
	spellData := ReadSpell(ctx, spells, m)
	caster := m.Guid()
	target := ReadOptionalGUID(m) // 0x0000000000000000 if no target
	castFlags := ReadCastFlags(m)
	targetsHit := m.Int32()
	numMissed := m.Int32()
	var corpseOwner *guid.GUID
	if m.Peek() != "" {
		corpseOwner = ReadOptionalGUID(m)
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	var item *int32
	if itemID != 0 {
		item = ptr.Ref(itemID)
	}

	return decoded(&messages.SpellGo{
		MessageBase:      messages.Base(ts),
		ItemID:           item,
		SpellData:        spellData,
		Caster:           caster,
		Target:           target,
		Flags:            castFlags,
		NumTargetsHit:    targetsHit,
		NumTargetsMissed: numMissed,
		CorpseOwner:      corpseOwner,
	})
}

func DecodeSpellStart(ctx context.Context, spells SpellLookup, ts time.Time, m RecordFields) ([]messages.Message, error) {
	itemID := m.Int32() // 0 if no item triggered it
	spellData := ReadSpell(ctx, spells, m)
	caster := m.Guid()
	target := ReadOptionalGUID(m) // 0x0000000000000000 if no target
	castFlags := ReadCastFlags(m)
	castTime := m.Int32()        // In millis
	channelDuration := m.Int32() // In millis, 0 if not a channel
	spellType := m.Int32()       // 0 = normal, 1 = channel, 2 = auto repeating

	if err := m.Error(); err != nil {
		return nil, err
	}

	var item *int32
	if itemID != 0 {
		item = ptr.Ref(itemID)
	}

	return decoded(&messages.SpellStart{
		MessageBase:     messages.Base(ts),
		ItemID:          item,
		SpellData:       spellData,
		Caster:          caster,
		Target:          target,
		Flags:           castFlags,
		CastTime:        time.Duration(castTime) * time.Millisecond,
		ChannelDuration: time.Duration(channelDuration) * time.Millisecond,
		SpellType:       spellType,
	})
}

func DecodeDispel(ctx context.Context, spells SpellLookup, ts time.Time, m RecordFields) ([]messages.Message, error) {
	caster := m.Guid()
	target := m.Guid()
	spell := ReadSpell(ctx, spells, m)

	if err := m.Error(); err != nil {
		return nil, err
	}

	return decoded(&messages.Dispel{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		Spell:       spell,
	})
}

func ReadOptionalGUID(m interface {
	String() string
	SetError(error)
}) *guid.GUID {
	value, err := func(s string) (*guid.GUID, error) {
		if s == "" || s == "nil" || s == "0x0000000000000000" {
			return nil, nil
		}
		id, err := guid.FromString(s)
		if err != nil {
			return nil, err
		}
		if id == 0 {
			return nil, nil
		}
		return &id, nil
	}(m.String())
	m.SetError(err)
	return value
}
func ReadCastFlags(m interface {
	String() string
	SetError(error)
}) types.CastFlags {
	value, err := func(s string) (types.CastFlags, error) {
		cf, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			return 0, err
		}
		return types.CastFlags(cf), nil
	}(m.String())
	m.SetError(err)
	return value
}
