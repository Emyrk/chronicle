package vanilla

import (
	"context"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"strconv"
	"strings"
	"time"
)

// SpellFields is the additional typed cursor surface for spell-backed records.
type SpellFields interface {
	CombatFields
	String() string
	Int32s() []int32
	School() types.School
	SetError(error)
}

// ReadSpell preserves the legacy signed 32-bit ID and missing-spell rules.
// Nonpositive IDs return nil without a lookup; errors stay on the field cursor.
func ReadSpell(ctx context.Context, db SpellLookup, m interface {
	String() string
	SetError(error)
}) *chrondbc.Spell {
	id, err := strconv.ParseInt(m.String(), 10, 32)
	if err != nil {
		m.SetError(err)
		return nil
	}
	if id <= 0 {
		return nil
	}
	spell, err := db.Spell(ctx, chrondbc.SpellID(id))
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			return ptr.Ref(chrondbc.UnknownSpell(chrondbc.SpellID(id)))
		}
		m.SetError(err)
		return nil
	}
	return spell
}

// DecodeHeal constructs the legacy HEAL payload without pipeline processing.
func DecodeHeal(ctx context.Context, spells SpellLookup, ts time.Time, m SpellFields) ([]messages.Message, error) {
	target := m.Guid()
	caster := m.Guid()
	spell := ReadSpell(ctx, spells, m)
	amount := int32(m.Int64())
	crit := m.Int64() == 1
	periodic := m.Int64() == 1

	hit := types.HitTypeHit
	if crit {
		hit = types.HitTypeCrit
	}
	if periodic {
		hit |= types.HitTypePeriodic
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	var name string
	var school types.School
	if spell != nil {
		name = spell.Name()
		school = spell.School.ToType()
	}

	return decoded(&messages.Heal{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		SpellName:   name,
		SpellData:   spell,
		Amount:      amount,
		HitType:     hit,
		School:      school,
	})
}

// DecodeSpellDamage retains mitigation ordering and local power-burn synthesis.
func DecodeSpellDamage(ctx context.Context, spells SpellLookup, ts time.Time, m SpellFields) ([]messages.Message, error) {
	target := m.Guid()
	caster := m.Guid()
	spell := ReadSpell(ctx, spells, m)
	amount := int32(m.Int64())
	mitigated := m.Int32s() // 3 values: absorbed, blocked, resisted
	hitInfo := m.Int64()
	school := m.School()
	effects := m.Int32s() // effect1, effect2, effect3, auraType

	hit := types.HitTypeHit
	if hitInfo == 2 {
		hit = types.HitTypeCrit
	}

	if err := m.Error(); err != nil {
		return nil, err
	}
	if spell == nil {
		return nil, fmt.Errorf("spell not found in DBC")
	}

	if len(mitigated) != 3 {
		return nil, fmt.Errorf("expected 3 mitigated values, got %d", len(mitigated))
	}

	if len(effects) != 4 {
		return nil, fmt.Errorf("expected 4 effect values, got %d", len(effects))
	}

	dt := spell.SpellDamageType()

	if dt.Has(chrondbc.SpellDamageDirect) && dt.Has(chrondbc.SpellDamagePeriodic) {
		auraEffect := AuraEffect(effects[3])
		switch auraEffect {
		case SPELL_AURA_PERIODIC_HEAL,
			SPELL_AURA_PERIODIC_DAMAGE,
			SPELL_AURA_PERIODIC_ENERGIZE,
			SPELL_AURA_PERIODIC_TRIGGER_SPELL,
			SPELL_AURA_PERIODIC_LEECH,
			SPELL_AURA_PERIODIC_HEALTH_FUNNEL,
			SPELL_AURA_PERIODIC_MANA_FUNNEL,
			SPELL_AURA_PERIODIC_MANA_LEECH,
			SPELL_AURA_PERIODIC_DAMAGE_PERCENT:
			hit |= types.HitTypePeriodic
		}
	} else if dt.Has(chrondbc.SpellDamagePeriodic) {
		hit |= types.HitTypePeriodic
	}

	var trailer types.Trailer
	if mitigated[0] > 0 || mitigated[1] > 0 || mitigated[2] > 0 {
		if mitigated[0] > 0 {
			trailer = append(trailer, types.TrailerEntry{
				Amount:  ptr.Ref(uint32(mitigated[0])),
				HitType: types.HitTypePartialAbsorb,
			})
		}
		if mitigated[1] > 0 {
			trailer = append(trailer, types.TrailerEntry{
				Amount:  ptr.Ref(uint32(mitigated[1])),
				HitType: types.HitTypePartialBlock,
			})
		}
		if mitigated[2] > 0 {
			trailer = append(trailer, types.TrailerEntry{
				Amount:  ptr.Ref(uint32(mitigated[2])),
				HitType: types.HitTypePartialResist,
			})
		}
	}

	msgs, err := decoded(&messages.Damage{
		MessageBase:     messages.Base(ts),
		SpellName:       ptr.Ref(spell.Name()),
		SpellData:       spell,
		Caster:          ptr.Ref(caster),
		Target:          target,
		HitType:         hit,
		Amount:          amount,
		School:          school,
		Trailer:         trailer,
		EnvironmentType: nil,
	})
	if err != nil {
		return nil, err
	}

	// Power burn spells (e.g. Mana Burn) drain the target's power and deal
	// damage proportional to the amount drained. The server never emits an
	// ENERGIZE line for the drained power — the SPELL_DMG line only carries
	// the damage component. Synthesize a ResourceChange so the drain is
	// visible in resource tracking.
	if rc := PowerBurnResourceChange(ts, spell, caster, target, amount, mitigated, effects, hit.Has(types.HitTypeCrit)); rc != nil {
		msgs = append(msgs, rc)
	}

	return msgs, nil
}

// PowerBurnResourceChange reconstructs drained power from pre-mitigation damage
// using the default-difficulty burn effect and its amplitude. Spell crits scale
// damage by 1.5 but not the drain. It returns nil when no power was burned.
func PowerBurnResourceChange(
	ts time.Time,
	spell *chrondbc.Spell,
	caster guid.GUID,
	target guid.GUID,
	amount int32,
	mitigated []int32,
	effects []int32,
	crit bool,
) messages.Message {
	// The logged effect order does not always match the DBC effect order, so
	// detect the power burn from the log, then look up the DBC effect index
	// for the misc value (power type) and damage multiplier.
	isBurn := AuraEffect(effects[3]) == SPELL_AURA_POWER_BURN_MANA
	for _, eff := range effects[:3] {
		if chrondbc.Effect(eff) == chrondbc.EffectPowerBurn {
			isBurn = true
		}
	}
	if !isBurn {
		return nil
	}

	var burnEffect *chrondbc.SpellEffect
	for _, effect := range spell.DefaultEffects() {
		if effect.Effect == chrondbc.EffectPowerBurn || effect.EffectAura == chrondbc.AuraEffectPowerBurn {
			burnEffect = &effect
			break
		}
	}
	if burnEffect == nil {
		return nil
	}
	powerType, ok := burnEffect.PowerBurnPowerType()
	if !ok {
		return nil
	}

	multiplier := float64(burnEffect.EffectAmplitude)
	if multiplier <= 0 {
		multiplier = 1
	}
	if crit {
		multiplier *= 1.5
	}

	preMitigation := amount + mitigated[0] + mitigated[1] + mitigated[2]
	burned := int32(float64(preMitigation)/multiplier + 0.5)
	if burned <= 0 {
		return nil
	}

	return &messages.ResourceChange{
		MessageBase: messages.Base(ts, messages.WithSynthetic()),
		Target:      target,
		Amount:      burned,
		Resource:    PowerTypeResource(powerType),
		Caster:      ptr.Ref(caster),
		SpellName:   ptr.Ref(spell.Name()),
		SpellData:   spell,
		Direction:   types.ChangeDirectionLoss,
	}
}

func School(s int32) types.School {
	switch s {
	case 0:
		return types.PhysicalSchool
	case 1:
		return types.HolySchool
	case 2:
		return types.FireSchool
	case 3:
		return types.NatureSchool
	case 4:
		return types.FrostSchool
	case 5:
		return types.ShadowSchool
	case 6:
		return types.ArcaneSchool
	default:
		return types.NoneSchool
	}
}

func PowerTypeResource(ty int32) types.Resource {
	switch ty {
	case 0:
		return types.ResourceMana
	case 1:
		return types.ResourceRage
	case 2:
		return types.ResourceFocus
	case 3:
		return types.ResourceEnergy
	case 4:
		return types.ResourceHappiness
	case -2:
		return types.ResourceHealth
	default:
		return types.ResourceUnknown
	}
}

type AuraEffect int32

const (
	SPELL_AURA_PERIODIC_DAMAGE         AuraEffect = 3
	SPELL_AURA_PERIODIC_DAMAGE_PERCENT AuraEffect = 89
	SPELL_AURA_PERIODIC_ENERGIZE       AuraEffect = 24
	SPELL_AURA_PERIODIC_HEAL           AuraEffect = 8
	SPELL_AURA_PERIODIC_HEALTH_FUNNEL  AuraEffect = 62
	SPELL_AURA_PERIODIC_LEECH          AuraEffect = 53
	SPELL_AURA_PERIODIC_MANA_FUNNEL    AuraEffect = 63
	SPELL_AURA_PERIODIC_MANA_LEECH     AuraEffect = 64
	SPELL_AURA_PERIODIC_TRIGGER_SPELL  AuraEffect = 23
	SPELL_AURA_POWER_BURN_MANA         AuraEffect = 162
)

// ParseInt32List preserves strict comma-separated signed 32-bit field parsing.
func ParseInt32List(raw string) ([]int32, error) {
	parts := strings.Split(raw, ",")
	all := make([]int32, 0, len(parts))
	for _, p := range parts {
		v, err := strconv.ParseInt(p, 10, 32)
		if err != nil {
			return nil, err
		}
		all = append(all, int32(v))
	}
	return all, nil
}
