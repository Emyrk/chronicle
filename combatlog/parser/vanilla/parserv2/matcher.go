package parserv2

import (
	"context"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/version"
)

func (p *Parser) header(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	result, err := next.DecodeHeader(ts, m, version.GitTag)
	if err != nil {
		return nil, err
	}
	if result.Version != nil {
		p.gameVersions = result.Version
	}
	return result.Messages, nil
}

func (p *Parser) auraCast(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeAuraCast(p.ctx, p, ts, m)
}

func (p *Parser) auraUpdate(ctx context.Context, ts time.Time, buff bool, m *Matched) ([]messages.Message, error) {
	return messages.Skip(ts, "not yet implements"), nil
}

func (p *Parser) energize(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeEnergize(p.ctx, p.wowDB, ts, m)
}

func (p *Parser) aura(ctx context.Context, event string, ts time.Time, buff bool, m *Matched) ([]messages.Message, error) {
	return next.DecodeAura(p.ctx, p.wowDB, event, ts, buff, m)
}

// raidComposition parses a roster-index snapshot. The encoded subgroup is the
// authority for group membership. Raid index orders members within each group.
// Rank, roster index, and reason are not part of the downstream message model.
func (p *Parser) raidComposition(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	r, err := next.DecodeRaidComposition(ts, m)
	p.applyCapabilities(r.Observed)
	return r.Messages, err
}

// raidGroup parses forty compact hexadecimal GUID fields representing eight
// five-player raid groups. Empty fields preserve unused slots and subgroup boundaries.
func (p *Parser) raidGroup(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	r, err := next.DecodeRaidGroup(ts, m)
	p.applyCapabilities(r.Observed)
	return r.Messages, err
}

func (p *Parser) zoneInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeZoneInfo(ts, m)
}

func (p *Parser) unitInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeUnitInfo(ts, m)
}

func (p *Parser) unitState(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	r, err := next.DecodeUnitState(ts, m)
	p.applyCapabilities(r.Observed)
	return r.Messages, err
}

func (p *Parser) combatantTransmog(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return p.combatants.DecodeTransmog(ts, m)
}

func (p *Parser) combatantTalents(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	_, trees := parsectx.DatasetTalents(ctx)
	return p.combatants.DecodeTalents(ts, m, trees)
}

func (p *Parser) combatantInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	_, trees := parsectx.DatasetTalents(ctx)
	return p.combatants.DecodeInfo(ts, m, p.gameVersions, next.CombatantOptions{TalentTrees: trees, Gear: p.itemFetcher, Logger: p.logger})
}

// 1771542038|SWING|0xF130002C3600BE05|0x000000000001C80A|52|2|1|1|0|0|0
func (p *Parser) swing(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSwing(p.ctx, p.wowDB, ts, m)
}

// 1771542037|HEAL|0x000000000001C80A|0x000000000001C80A|27805|507|0|0
func (p *Parser) heal(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeHeal(p.ctx, p, ts, m)
}

func (p *Parser) spellMiss(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeMiss(p.ctx, p, ts, m)
}

func (p *Parser) dmgShield(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeDamageShield(p.ctx, p.wowDB, ts, m)
}

func (p *Parser) envDmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeEnvironmentDamage(p.ctx, p.wowDB, ts, m)
}

// 1771564201000|SPELL_DMG|0xF130002C3800949D|0x000000000001C7AC|22482|67|0,0,0|0|0|2,0,0,0

// Moonfire hit and tick
// 1771966668876|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|329|0,0,0|0|6|6,2,0,0
// 1771966671851|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
// 1771966674890|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
func (p *Parser) spell_dmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSpellDamage(p.ctx, p, ts, m)
}

// powerBurnResourceChange synthesizes a ResourceChange for SPELL_DMG lines
// produced by SPELL_EFFECT_POWER_BURN (62) or SPELL_AURA_POWER_BURN_MANA (162).
//
// Each point of power burned deals damage multiplied by the effect's damage
// multiplier (EffectAmplitude, e.g. 0.5 for Mana Burn rank 5: "for each mana
// drained in this way, the target takes 0.5 Shadow damage"), so the power
// drained is recovered from the pre-mitigation damage:
// (amount + absorbed + blocked + resisted) / multiplier.
// The damage component can crit (1.5x for spells) but the drain does not, so
// crits are divided back out.
// Example line (Mana Burn rank 5 fully absorbed by a shield, 916 mana burned):
//
//	1784050453916|SPELL_DMG|0xF130006287017F8B|0x000000000001D795|10876|0|458,0,0|0|5|62,0,0,0
//
// Returns nil when the event is not a power burn or no power was drained.
func powerBurnResourceChange(
	ts time.Time,
	spell *chrondbc.Spell,
	caster guid.GUID,
	target guid.GUID,
	amount int32,
	mitigated []int32,
	effects []int32,
	crit bool,
) messages.Message {
	return next.PowerBurnResourceChange(ts, spell, caster, target, amount, mitigated, effects, crit)
}

//func (p *Parser) spellStart(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
//	itemID := m.Int32() // 0 if no item triggered it
//	spellData := m.DBCSpellByID(p.ctx, p)
//	caster := m.Guid()
//	target := m.OptionalGuid() // 0x0000000000000000 if no target
//	castFlags := m.CastFlags()
//	castTime := m.Int32()        // In millis
//	channelDuration := m.Int32() // In millis, 0 if not a channel
//	spellType := m.Int32()       // 0 = normal, 1 = channel, 2 = auto repeating
//	corpseOwner := m.OptionalGuid()
//
//	if err := m.Error(); err != nil {
//		return nil, err
//	}
//
//	var item *int32
//	if itemID != 0 {
//		item = ptr.Ref(itemID)
//	}
//
//	return set(&messages.SpellGo{
//		MessageBase:      messages.Base(ts),
//		ItemID:           item,
//		SpellID:          spellData.ID,
//		SpellData:        spellData,
//		Caster:           caster,
//		Target:           target,
//		Flags:            castFlags,
//		NumTargetsHit:    targetsHit,
//		NumTargetsMissed: numMissed,
//		CorpseOwner:      corpseOwner,
//	})
//}

// spellGo does indicate a spell being landed/missed. These logs also appear as
// SPELL_DMG and "MISS" logs.
func (p *Parser) spellGo(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSpellGo(p.ctx, p, ts, m)
}

func (p *Parser) spellStart(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSpellStart(p.ctx, p, ts, m)
}

func (p *Parser) spellFail(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	if !strings.HasPrefix(strings.TrimSpace(m.peek()), "0x") {
		// Client failure, ignoring for now.
		return []messages.Message{}, nil
	}

	caster := m.Guid()
	spell := m.DBCSpellByID(p.ctx, p.wowDB)
	serverSide := true
	if m.Remain() > 0 {
		serverSide = m.Bool()
	}

	if !serverSide {
		return []messages.Message{}, nil
	}

	return set(&messages.SpellFail{
		MessageBase:    messages.Base(ts),
		SpellData:      spell,
		Caster:         caster,
		FailedByServer: serverSide,
	})
}

func (p *Parser) slain(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeDeath(ts, m)
}

func (p *Parser) dispel(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeDispel(p.ctx, p, ts, m)
}

func (p *Parser) loot(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeLoot(ts, m)
}

// 1775356811498|LOOT_TRADE|Jimmythehand trades item Bloodfang Spaulders to Eithinis.

func (p *Parser) lootTrade(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeLootTrade(ts, m)
}

func set(m ...messages.Message) ([]messages.Message, error) {
	return m, nil
}

// Apply even on decode error: legacy UNIT_STATE observes resources before
// parsing position fields, which can subsequently fail. Keep that partial fact.
func (p *Parser) applyCapabilities(observed next.Capabilities) {
	p.sawRaidGroup = p.sawRaidGroup || observed.RaidGroup
	p.sawUnitResources = p.sawUnitResources || observed.UnitResources
	p.sawUnitPosition = p.sawUnitPosition || observed.UnitPosition
}
