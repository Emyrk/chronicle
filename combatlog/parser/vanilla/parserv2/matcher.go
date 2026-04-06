package parserv2

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

const dateLayout = "02.01.06 15:04:05"

func (p *Parser) header(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	player := m.OptionalGuid()
	realmName := m.String()
	zoneName := m.String()
	addonVersion := m.String()
	superWoWVersion := m.String()
	namPowerVersion := m.String()
	xp3Version := m.String()
	wowVersion := m.String()
	wowBuild := m.Int32()
	wowBuildDate := m.String()
	localTimeStr := m.String()
	utcTimeStr := m.String()

	// TODO: If ts is 0, set to utc time

	var _ = player
	var _ = zoneName
	var _, _, _, _ = addonVersion, superWoWVersion, namPowerVersion, xp3Version

	if err := m.Error(); err != nil {
		return nil, err
	}

	localTime, err := time.Parse(dateLayout, localTimeStr)
	if err != nil {
		return nil, fmt.Errorf("parsing local time: %w", err)
	}
	var _ = localTime

	utcTime, err := time.Parse(dateLayout, utcTimeStr)
	if err != nil {
		return nil, fmt.Errorf("parsing local time: %w", err)
	}

	if ts.IsZero() {
		ts = utcTime
	}

	return set(
		//&messages.Zone{
		//	MessageBase: messages.Base(ts),
		//	Zone: zone.Zone{
		//		Name:         zoneName,
		//		InstanceID:   0,
		//		Ghost:        false,
		//		InstanceType: "",
		//		IsInstance:   false,
		//	},
		//},
		&messages.Realm{
			MessageBase: messages.Base(ts),
			Info: realm.Info{
				Seen:      ts,
				Version:   wowVersion,
				Build:     int(wowBuild),
				BuildDate: wowBuildDate,
				RealmName: realmName,
			},
		},
	)
}

func (p *Parser) auraCast(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	spell := m.DBCSpellByID(p)
	caster := m.Guid()
	target := m.OptionalGuid()
	effect := chrondbc.Effect(m.Int32())
	auraName := chrondbc.AuraEffect(m.Int32())
	amplitude := m.Int32()
	effectMiscValue := m.Int32()
	durationMS := m.Int32()
	capStatus := m.Int32()

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.AuraCast{
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

func (p *Parser) auraUpdate(ctx context.Context, ts time.Time, buff bool, m *Matched) ([]messages.Message, error) {
	return messages.Skip(ts, "not yet implements"), nil
}

func (p *Parser) energize(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	target := m.Guid()
	caster := m.OptionalGuid()
	spell := m.DBCSpellByID(p.wowDB)
	powerType := m.PowerType()
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

	return set(&messages.ResourceChange{
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

func (p *Parser) aura(ctx context.Context, event string, ts time.Time, buff bool, m *Matched) ([]messages.Message, error) {
	target := m.Guid()
	m.skip() // buff slot
	spell := m.DBCSpellByID(p.wowDB)
	stack := m.Int32()
	m.skip() // aura level
	m.skip() // aura slot
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

	return set(&messages.Aura{
		MessageBase: messages.Base(ts),
		IsBuff:      buff,
		Target:      target,
		SpellName:   spName,
		SpellData:   spell,
		Amount:      stack,
		State:       state,
	})
}

func (p *Parser) zoneInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	name := m.String()
	instanceID := uint32(m.Uint64())
	inInstance := m.Int64() == 1
	instanceType := m.String() // none, party, raid, pvp
	isGhost := m.Int64() == 1

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Zone{
		MessageBase: messages.Base(ts),
		Zone: zone.Zone{
			Seen: ts,
			// For some reason, a zone name came across as all caps once.
			Name:         strings.ToLower(name),
			InstanceID:   instanceID,
			Ghost:        isGhost,
			InstanceType: instanceType,
			IsInstance:   inInstance,
		},
	})
}

func (p *Parser) unitInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	id := m.Guid()
	isPlayer := m.Bool()
	name := m.String()
	canCooperate := m.Int64() == 1
	owner := m.OptionalGuid()
	buffs, err := unitinfo.ParseBuffs(m.String())
	if err != nil {
		return nil, fmt.Errorf("unit buffs: %w", err)
	}
	level := m.Int64()
	challenges := m.CSV()
	maxHealth := m.Int64()
	var _ = maxHealth
	var charm *guid.GUID
	if m.Remain() > 0 {
		charm = m.OptionalGuid()
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	// This feels a bit jank, but the WoW `UnitName` function can return "Unknown".
	// Unsure why, but when it does that name will be propagated up. In some cases,
	// if we know it is not a player, and it has an entry ID, we can fix the name
	// here. Maintaining a list of seen "unknowns" hopefully does not get that large.
	if (name == "Unknown" || name == "") && !id.IsPlayer() {
		knownName := unitname.ByGUID(id)
		if knownName != "" {
			name = knownName
		}
	}

	return set(&messages.Unit{
		MessageBase: messages.Base(ts),
		Info: unitinfo.Info{
			Seen:         ts,
			Guid:         id,
			IsPlayer:     isPlayer,
			Name:         name,
			CanCooperate: canCooperate,
			Owner:        owner,
			Buffs:        buffs,
			Level:        int32(level),
			Challenges:   challenges,
			Charm:        charm,
		},
	})
}

func (p *Parser) combatantInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	var guild *combatant.Guild

	id := m.Guid()
	name := m.String()
	class := m.HeroClass()
	race := m.HeroRace()
	gender := m.HeroGender()
	guildName := m.String()
	if guildName != "" {
		guildRankName := m.String()
		guildRank := m.Int32()
		guild = &combatant.Guild{
			Name:      guildName,
			RankName:  guildRankName,
			RankIndex: guildRank,
		}
	} else {
		m.skip()
		m.skip()
	}
	gearStr := m.String()
	talentsStr := m.String()
	petName := m.String()
	petGuid := m.OptionalGuid()

	var _ = petGuid
	if err := m.Error(); err != nil {
		return nil, err
	}

	talents, err := combatant.ParseTalents(talentsStr)
	if err != nil {
		return nil, fmt.Errorf("parsing talents: %w", err)
	}

	return set(&messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant: combatant.Combatant{
			Name:       name,
			Guid:       id,
			Seen:       ts,
			HeroClass:  class,
			Gender:     gender,
			Race:       race,
			PetName:    petName,
			Guild:      guild,
			GearSetups: combatant.ParseGear(strings.Split(gearStr, "&")),
			Talents:    talents,
		},
	})
}

// 1771542038|SWING|0xF130002C3600BE05|0x000000000001C80A|52|2|1|1|0|0|0
func (p *Parser) swing(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
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

	auto, err := p.wowDB.Spell(chrondbc.SpellIDAutoAttack)
	if err != nil {
		return nil, fmt.Errorf("fetching auto attack spell: %w", err)
	}
	ht := HitType(amount, components, info, victimState)

	return set(&messages.Damage{
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

// 1771542037|HEAL|0x000000000001C80A|0x000000000001C80A|27805|507|0|0
func (p *Parser) heal(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	target := m.Guid()
	caster := m.Guid()
	spell := m.DBCSpellByID(p)
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

	return set(&messages.Heal{
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

func (p *Parser) spellMiss(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	caster := m.Guid()
	target := m.Guid()
	spell := m.DBCSpellByID(p)
	hit := m.SpellMissInfo()

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

	return set(&messages.Damage{
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

// 1771564201000|SPELL_DMG|0xF130002C3800949D|0x000000000001C7AC|22482|67|0,0,0|0|0|2,0,0,0

// Moonfire hit and tick
// 1771966668876|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|329|0,0,0|0|6|6,2,0,0
// 1771966671851|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
// 1771966674890|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
func (p *Parser) spell_dmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	target := m.Guid()
	caster := m.Guid()
	spell := m.DBCSpellByID(p)
	amount := int32(m.Int64())
	mitigated := m.Int32s() // 3 values: blocked, absorbed, resisted
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
				HitType: types.HitTypePartialBlock,
			})
		}
		if mitigated[1] > 0 {
			trailer = append(trailer, types.TrailerEntry{
				Amount:  ptr.Ref(uint32(mitigated[1])),
				HitType: types.HitTypePartialAbsorb,
			})
		}
		if mitigated[2] > 0 {
			trailer = append(trailer, types.TrailerEntry{
				Amount:  ptr.Ref(uint32(mitigated[2])),
				HitType: types.HitTypePartialResist,
			})
		}
	}

	return set(&messages.Damage{
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
}

//func (p *Parser) spellStart(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
//	itemID := m.Int32() // 0 if no item triggered it
//	spellData := m.DBCSpellByID(p)
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
	itemID := m.Int32() // 0 if no item triggered it
	spellData := m.DBCSpellByID(p)
	caster := m.Guid()
	target := m.OptionalGuid() // 0x0000000000000000 if no target
	castFlags := m.CastFlags()
	targetsHit := m.Int32()
	numMissed := m.Int32()
	var corpseOwner *guid.GUID
	if m.peek() != "" {
		corpseOwner = m.OptionalGuid()
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	var item *int32
	if itemID != 0 {
		item = ptr.Ref(itemID)
	}

	return set(&messages.SpellGo{
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

func (p *Parser) spellStart(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	itemID := m.Int32() // 0 if no item triggered it
	spellData := m.DBCSpellByID(p)
	caster := m.Guid()
	target := m.OptionalGuid() // 0x0000000000000000 if no target
	castFlags := m.CastFlags()
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

	return set(&messages.SpellStart{
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

func (p *Parser) spellFail(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	if !strings.HasPrefix(strings.TrimSpace(m.peek()), "0x") {
		// Client failure, ignoring for now.
		return []messages.Message{}, nil
	}

	caster := m.Guid()
	spell := m.DBCSpellByID(p.wowDB)
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
	id := m.Guid()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var dmg *messages.Damage // For unit tests, this is dumb
	return set(&messages.Slain{
		MessageBase: messages.Base(ts),
		Victim:      id,
		Killer:      nil,
		Attribution: dmg,
	})
}

func set(m ...messages.Message) ([]messages.Message, error) {
	return m, nil
}
