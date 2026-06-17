package parserv2

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/Masterminds/semver"
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

	var _ = zoneName

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

	chronicleCompanion, ccv := semver.NewVersion(addonVersion)

	if ccv == nil {
		p.gameVersions = &gameversions.GameVersion{
			ChronicleCompanionAddon: chronicleCompanion,
		}
	}

	versions := make(map[string]string)
	if addonVersion != "" {
		versions["chronicle_companion"] = addonVersion
		versions["addon"] = addonVersion
	}
	if superWoWVersion != "" {
		versions["superwow"] = superWoWVersion
	}
	if namPowerVersion != "" {
		versions["nampower"] = namPowerVersion
	}
	if xp3Version != "" {
		versions["xp3"] = xp3Version
	}
	if wowVersion != "" {
		versions["wow_client"] = wowVersion
	}
	if wowBuild != 0 {
		versions["wow_build"] = fmt.Sprintf("%d", wowBuild)
	}
	versions["chronicle"] = version.GitTag

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
		&messages.Versions{
			MessageBase: messages.Base(ts),
			Player:      player,
			Versions:    versions,
		},
	)
}

func (p *Parser) auraCast(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	spell := m.DBCSpellByID(p.ctx, p)
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
	spell := m.DBCSpellByID(p.ctx, p.wowDB)
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
	spell := m.DBCSpellByID(p.ctx, p.wowDB)
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
	instanceID := m.OptionalUint32()
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
			MaxHealth:    maxHealth,
		},
	})
}

var (
	talentsSupported = semver.MustParse("0.19")
)

func (p *Parser) combatantTransmog(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	name := m.String()
	items := strings.Split(m.String(), "&")

	if err := m.Error(); err != nil {
		return nil, err
	}

	mogs := make([]combatant.Transmog, 0, len(items))
	for _, item := range items {
		parts := strings.Split(item, ":")
		if len(parts) != 3 {
			continue
		}

		slot, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}

		itemID, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}

		transmogID, err := strconv.Atoi(parts[2])
		if err != nil {
			continue
		}
		mogs = append(mogs, combatant.Transmog{
			Slot:       int32(slot - 1),
			ItemID:     int32(itemID),
			TransmogID: int32(transmogID),
		})
	}

	if len(mogs) == 0 {
		return nil, nil
	}

	return set(&messages.Transmog{
		MessageBase: messages.Base(ts),
		PlayerName:  name,
		Transmogs:   mogs,
	})
}

// COMBATANT_TALENTS: guid|playerName|tab1|tab2|tab3
// Each tab: TabName;pointsSpent;rankDigits
func (p *Parser) combatantTalents(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	id := m.Guid()
	name := m.String()

	var tabs [3]messages.CombatantTalentTab
	for i := 0; i < 3; i++ {
		raw := m.String()
		parts := strings.SplitN(raw, ";", 3)
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid talent tab format: %q", raw)
		}
		pts, err := strconv.Atoi(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid points spent in talent tab: %w", err)
		}
		tabs[i] = messages.CombatantTalentTab{
			TabName:     parts[0],
			PointsSpent: pts,
			RankDigits:  parts[2],
		}
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.CombatantTalents{
		MessageBase: messages.Base(ts),
		Guid:        id,
		PlayerName:  name,
		Tabs:        tabs,
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

	if p.gameVersions != nil &&
		p.gameVersions.ChronicleCompanionAddon.LessThan(talentsSupported) {
		talentsStr = ""
	}

	talents, err := combatant.ParseTalents(talentsStr)
	if err != nil {
		talents = nil
		p.logger.Error("parsing talents, setting to nil", "error", err)
	}

	gear := combatant.ParseGear(strings.Split(gearStr, "&"))
	if p.itemFetcher != nil {
		p.itemFetcher.ResolveGear(gear)
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
			GearSetups: gear,
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

	auto, err := p.wowDB.Spell(p.ctx, chrondbc.SpellIDAutoAttack)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			auto = ptr.Ref(chrondbc.UnknownSpell(chrondbc.SpellIDAutoAttack))
		} else {
			return nil, fmt.Errorf("fetching auto attack spell: %w", err)
		}
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
	spell := m.DBCSpellByID(p.ctx, p)
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
	spell := m.DBCSpellByID(p.ctx, p)
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

func (p *Parser) dmgShield(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
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
		spellID = gamedb.ReflectPhysical
	case types.HolySchool:
		spellID = gamedb.ReflectHoly
	case types.FireSchool:
		spellID = gamedb.ReflectFire
	case types.NatureSchool:
		spellID = gamedb.ReflectNature
	case types.FrostSchool:
		spellID = gamedb.ReflectFrost
	case types.ShadowSchool:
		spellID = gamedb.ReflectShadow
	case types.ArcaneSchool:
		spellID = gamedb.ReflectArcane
	default:
		return nil, fmt.Errorf("unknown school type: %d", school)
	}

	spell, err := p.wowDB.Spell(p.ctx, spellID)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			spell = ptr.Ref(chrondbc.UnknownSpell(spellID))
		} else {
			return nil, fmt.Errorf("fetching environment spell: %w", err)
		}
	}

	return set(&messages.Damage{
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

func (p *Parser) envDmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
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
		spellID = gamedb.EnvironmentFatigue
	case 1: // Drowning
		envType = types.EnvironmentTypeDrowning
		school = types.PhysicalSchool
		spellID = gamedb.EnvironmentDrowning
	case 2: // Falling
		envType = types.EnvironmentTypeFall
		school = types.PhysicalSchool
		spellID = gamedb.EnvironmentFalling
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
		spellID = gamedb.EnvironmentFire
	case 6: // Fall to void
		envType = types.EnvironmentTypeFall
		school = types.PhysicalSchool
		spellID = gamedb.EnvironmentFalling
	default:
		return nil, fmt.Errorf("unknown environment damage type: %d", dmgType)
	}

	spell, err := p.wowDB.Spell(p.ctx, spellID)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			spell = ptr.Ref(chrondbc.UnknownSpell(spellID))
		} else {
			return nil, fmt.Errorf("fetching environment spell: %w", err)
		}
	}

	return set(&messages.Damage{
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

// 1771564201000|SPELL_DMG|0xF130002C3800949D|0x000000000001C7AC|22482|67|0,0,0|0|0|2,0,0,0

// Moonfire hit and tick
// 1771966668876|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|329|0,0,0|0|6|6,2,0,0
// 1771966671851|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
// 1771966674890|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
func (p *Parser) spell_dmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	target := m.Guid()
	caster := m.Guid()
	spell := m.DBCSpellByID(p.ctx, p)
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
	itemID := m.Int32() // 0 if no item triggered it
	spellData := m.DBCSpellByID(p.ctx, p)
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
	spellData := m.DBCSpellByID(p.ctx, p)
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

func (p *Parser) dispel(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	caster := m.Guid()
	target := m.Guid()
	spell := m.DBCSpellByID(p.ctx, p)

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Dispel{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      target,
		Spell:       spell,
	})
}

func (p *Parser) loot(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	playerName := m.String()
	rest := m.rest()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var itemID int32
	var itemSuffix int32
	for _, part := range rest {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "Hitem:") {
			part = strings.TrimSpace(strings.TrimPrefix(part, "Hitem:"))
			fields := strings.Split(part, ":")
			if len(fields) != 4 {
				return nil, fmt.Errorf("unexpected item string format: %s", part)
			}

			itemID64, err := strconv.Atoi(fields[0])
			if err != nil {
				return nil, fmt.Errorf("parsing item ID: %w", err)
			}

			itemSuffix64, err := strconv.Atoi(fields[3])
			if err != nil {
				return nil, fmt.Errorf("parsing item suffix: %w", err)
			}
			itemID = int32(itemID64)
			itemSuffix = int32(itemSuffix64)
			break
		}
	}

	itemName := rest[3]
	itemName = strings.Trim(strings.TrimPrefix(itemName, "h"), `[]`)

	last := rest[len(rest)-1]
	quantity := int32(1)
	if strings.HasPrefix(last, "rx") {
		quantity64, err := strconv.Atoi(strings.TrimPrefix(last, "rx"))
		if err != nil {
			return nil, fmt.Errorf("parsing loot quantity %q: %w", last, err)
		}
		quantity = int32(quantity64)
	}

	return set(&messages.Loot{
		MessageBase:  messages.Base(ts),
		PlayerName:   playerName,
		ItemName:     itemName,
		ItemID:       itemID,
		ItemSuffixID: itemSuffix,
		Quantity:     quantity,
	})
}

// 1775356811498|LOOT_TRADE|Jimmythehand trades item Bloodfang Spaulders to Eithinis.
var lootTradeRegex = regexp.MustCompile(`(.+[^\s]) trades item (.+[^\s]) to (.+[^\s])\.`)

func (p *Parser) lootTrade(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	message := m.String()
	if err := m.Error(); err != nil {
		return nil, err
	}

	matches, ok := types.FromRegex(lootTradeRegex).Match(message)
	if !ok {
		return nil, fmt.Errorf("loot trade regex does not match %q", message)
	}

	from := matches.String()
	itemName := matches.String()
	to := matches.String()

	return set(&messages.LootTrade{
		MessageBase:    messages.Base(ts),
		FromPlayerName: from,
		ToPlayerName:   to,
		ItemName:       itemName,
	})
}

func set(m ...messages.Message) ([]messages.Message, error) {
	return m, nil
}
