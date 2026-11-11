package vanilla

import (
	"context"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/spellids"
	"github.com/Emyrk/chronicle/internal/ptr"
	"time"
)

func DecodeMiss(ctx context.Context, spells SpellLookup, ts time.Time, m SpellFields) ([]messages.Message, error) {
	caster := m.Guid()
	target := m.Guid()
	spell := ReadSpell(ctx, spells, m)
	hit := SpellMissHit(m.Int32())

	if err := m.Error(); err != nil {
		return nil, err
	}

	var name *string
	var school types.School
	if spell != nil {
		name = ptr.Ref(spell.Name())
		school = spell.School.ToType()

		dt := spell.SpellDamageType()
		// If it can only be periodic, then add the periodic modifier as well.
		if dt == chrondbc.SpellDamagePeriodic {
			hit |= types.HitTypePeriodic
		}
	}

	return decoded(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       name,
		SpellData:       spell,
		Caster:          ptr.Ref(caster),
		Target:          target,
		HitType:         hit,
		Amount:          0,
		School:          school,
		Trailer:         nil,
		EnvironmentType: nil,
	})
}

func DecodeDamageShield(ctx context.Context, spells SpellLookup, ts time.Time, m SpellFields) ([]messages.Message, error) {
	caster := m.Guid()
	target := m.Guid()
	damage := m.Int32()
	school := m.School()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var spellID chrondbc.SpellID
	switch school {
	case types.PhysicalSchool:
		spellID = spellids.ReflectPhysical
	case types.HolySchool:
		spellID = spellids.ReflectHoly
	case types.FireSchool:
		spellID = spellids.ReflectFire
	case types.NatureSchool:
		spellID = spellids.ReflectNature
	case types.FrostSchool:
		spellID = spellids.ReflectFrost
	case types.ShadowSchool:
		spellID = spellids.ReflectShadow
	case types.ArcaneSchool:
		spellID = spellids.ReflectArcane
	default:
		return nil, fmt.Errorf("unknown school type: %d", school)
	}

	spell, err := spells.Spell(ctx, spellID)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			spell = ptr.Ref(chrondbc.UnknownSpell(spellID))
		} else {
			return nil, fmt.Errorf("fetching environment spell: %w", err)
		}
	}

	return decoded(&messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      ptr.Ref(caster),
		SpellName:   ptr.Ref(spell.Name()),
		SpellData:   spell,
		Target:      target,
		HitType:     types.HitTypeHit,
		Amount:      damage,
		School:      school,
	})
}

func DecodeEnvironmentDamage(ctx context.Context, spells SpellLookup, ts time.Time, m SpellFields) ([]messages.Message, error) {
	target := m.Guid()
	dmgType := m.Int32()
	damage := m.Int32()
	absorbed := m.Int32()
	resisted := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var trailer types.Trailer
	if absorbed > 0 {
		trailer = append(trailer, types.TrailerEntry{
			Amount:  ptr.Ref(uint32(absorbed)),
			HitType: types.HitTypePartialAbsorb,
		})
	}

	if resisted > 0 {
		trailer = append(trailer, types.TrailerEntry{
			Amount:  ptr.Ref(uint32(resisted)),
			HitType: types.HitTypePartialResist,
		})
	}

	var spellID chrondbc.SpellID
	var envType types.EnvironmentType
	var school types.School
	switch dmgType {
	case 0: // Fatigue
		envType = types.EnvironmentTypeFatigue
		school = types.PhysicalSchool
		spellID = spellids.EnvironmentFatigue
	case 1: // Drowning
		envType = types.EnvironmentTypeDrowning
		school = types.PhysicalSchool
		spellID = spellids.EnvironmentDrowning
	case 2: // Falling
		envType = types.EnvironmentTypeFall
		school = types.PhysicalSchool
		spellID = spellids.EnvironmentFalling
	case 3: // Lava
		envType = types.EnvironmentTypeLava
		spellID = 16455
		school = types.FireSchool
	case 4: // Slime
		envType = types.EnvironmentTypeSlime
		spellID = 16456
		school = types.NatureSchool
	case 5: // Fire
		envType = types.EnvironmentTypeFire
		school = types.FireSchool
		spellID = spellids.EnvironmentFire
	case 6: // Fall to void
		envType = types.EnvironmentTypeFall
		school = types.PhysicalSchool
		spellID = spellids.EnvironmentFalling
	default:
		return nil, fmt.Errorf("unknown environment damage type: %d", dmgType)
	}

	spell, err := spells.Spell(ctx, spellID)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			spell = ptr.Ref(chrondbc.UnknownSpell(spellID))
		} else {
			return nil, fmt.Errorf("fetching environment spell: %w", err)
		}
	}

	return decoded(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       ptr.Ref(spell.Name()),
		SpellData:       spell,
		Target:          target,
		HitType:         types.HitTypeEnvironment,
		Amount:          damage,
		School:          school,
		Trailer:         trailer,
		EnvironmentType: &envType,
	})
}

func SpellMissHit(value int32) types.HitType {
	switch SpellMissInfo(value) {
	case SPELL_MISS_NONE:
		return types.HitTypeNone
	case SPELL_MISS_MISS:
		return types.HitTypeMiss
	case SPELL_MISS_RESIST:
		return types.HitTypeFullResist
	case SPELL_MISS_DODGE:
		return types.HitTypeDodge
	case SPELL_MISS_PARRY:
		return types.HitTypeParry
	case SPELL_MISS_BLOCK:
		return types.HitTypeFullBlock
	case SPELL_MISS_EVADE:
		return types.HitTypeEvade
	case SPELL_MISS_IMMUNE:
		return types.HitTypeImmune
	case SPELL_MISS_IMMUNE2:
		return types.HitTypeImmune
	case SPELL_MISS_DEFLECT:
		return types.HitTypeDeflect
	case SPELL_MISS_ABSORB:
		return types.HitTypeFullAbsorb
	case SPELL_MISS_REFLECT:
		return types.HitTypeReflect
	default:
		return types.HitTypeNone
	}
}

type SpellMissInfo int32

const (
	SPELL_MISS_NONE    SpellMissInfo = 0  //   -- No miss (shouldn't normally appear)
	SPELL_MISS_MISS    SpellMissInfo = 1  //   -- Miss
	SPELL_MISS_RESIST  SpellMissInfo = 2  //   -- Resist (also used for SMSG_PROCRESIST)
	SPELL_MISS_DODGE   SpellMissInfo = 3  //   -- Dodge
	SPELL_MISS_PARRY   SpellMissInfo = 4  //   -- Parry
	SPELL_MISS_BLOCK   SpellMissInfo = 5  //   -- Block
	SPELL_MISS_EVADE   SpellMissInfo = 6  //   -- Evade
	SPELL_MISS_IMMUNE  SpellMissInfo = 7  //   -- Immune
	SPELL_MISS_IMMUNE2 SpellMissInfo = 8  //   -- Immune (variant)
	SPELL_MISS_DEFLECT SpellMissInfo = 9  //   -- Deflect
	SPELL_MISS_ABSORB  SpellMissInfo = 10 //  -- Absorb
	SPELL_MISS_REFLECT SpellMissInfo = 11 //  -- Reflect
)
