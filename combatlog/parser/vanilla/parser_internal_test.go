package vanilla

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/whoami"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"
	"github.com/stretchr/testify/require"
)

func BenchmarkParsing(b *testing.B) {
	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())
	p, err := New(logger, strings.NewReader(""))
	require.NoError(b, err)

	someLogs := []string{
		"CAST: 0xF14000847E002E7C(Whisper) casts Prowl(24453)(Rank 3) on 0xF14000847E002E7C(Whisper).",
		"CAST: 0x000000000002594C(Zoie) casts Blink(1953).",
		"Power Word: Shield fades from 0xF13000EF272748C7.",
		"UNIT_INFO: 13.12.25 19:51:05&0x000000000002594C&1&Zoie&1&&,27681=1,21850=1,21564=1,23028=1,25895=1,22783=1,25898=1,25894=1,17539=1,45489=1,17628=1,56544=1,17535=1,17538=1,10225=1",
		"0x000000000008B2C1 crits 0xF13000EF272748C7 for 182.",
		"0x0000000000079B43's Arcane Missiles crits 0xF13000EF272748C7 for 683 Arcane damage. (227 resisted)",
		"Tree of Life Aura fades from 0x0000000000067457.",
	}

	b.Run("RandomLogs", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, err := p.ParseContent(nil, time.Time{}, someLogs[i%len(someLogs)])
			require.NoError(b, err)
		}
	})
}

func TestParserMessages(t *testing.T) {
	t.Parallel()

	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())
	p, err := New(logger, strings.NewReader(""))
	require.NoError(t, err)

	//t.Run("Spell Cast Attempt", func(t *testing.T) {
	//	att, err := exp[SpellCastAttempt](p.fSpellCastAttempt(time.Time{}, "Randgriz begins to cast Flash Heal."))
	//	require.NoError(t, err)
	//	require.Equal(t, "Randgriz", att.Caster.Name)
	//	require.Equal(t, "Flash Heal", att.SpellName)
	//})

	t.Run("LegacyCast", func(t *testing.T) {
		gl, err := exp[*messages.LegacyCast](p.ParseContent(nil, time.Time{}, "0xF130000282013577 performs Eject Sneed."))
		require.NoError(t, err)

		require.Equal(t, messages.LegacyCast{
			MessageBase: messages.MessageBase{},
			Caster:      0xF130000282013577,
			Spell:       "Eject Sneed",
		}, gl)

		dz, err := exp[*messages.LegacyCast](p.ParseContent(nil, time.Time{}, "0xF13000114001359D performs Dazed on 0x00000000006FEF22."))
		require.NoError(t, err)

		require.Equal(t, messages.LegacyCast{
			MessageBase: messages.MessageBase{},
			Caster:      0xF13000114001359D,
			Spell:       "Dazed",
			Target:      ptr.Ref[guid.GUID](0x00000000006FEF22),
		}, dz)
	})

	t.Run("Damage", func(t *testing.T) {
		gl, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x000000000008B2C1 hits 0xF130002FE800DD20 for 60. (glancing)"))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:  ptr.Ref[guid.GUID](0x000000000008B2C1),
			HitType: types.HitTypeGlancing,
			Target:  0xF130002FE800DD20,
			Amount:  60,
			School:  types.PhysicalSchool,
			Trailer: types.Trailer{},
		}, gl)

		cr, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF1300038B500C02F hits 0x000000000002A904 for 0. (crushing) (886 absorbed)"))
		require.NoError(t, err)
		require.Equal(t, messages.Damage{
			Caster:  ptr.Ref(guid.GUID(0xF1300038B500C02F)),
			Target:  0x000000000002A904,
			HitType: types.HitTypeCrushing,
			Amount:  0,
			Trailer: types.Trailer{
				{
					Amount:  ptr.Ref(uint32(886)),
					HitType: types.HitTypePartialAbsorb,
				},
			},
			School:          types.PhysicalSchool,
			EnvironmentType: nil,
		}, cr)
	})

	// With school: 0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage
	t.Run("SpellHit", func(t *testing.T) {
		sh, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x0000000000062A1B's Hamstring hits 0xF1300033F000CFD0 for 27."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0x0000000000062A1B),
			SpellName: ptr.Ref("Hamstring"),
			HitType:   types.HitTypeHit,
			Target:    0xF1300033F000CFD0,
			Amount:    27,
			Trailer:   nil,
		}, sh)

		pa, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF13000342E024B85's Shoot hits 0x0000000000024225 for 0. (183 absorbed)"))
		require.NoError(t, err)
		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0xF13000342E024B85),
			SpellName: ptr.Ref("Shoot"),
			HitType:   types.HitTypeHit,
			Target:    0x0000000000024225,
			Amount:    0,
			Trailer: types.Trailer{
				{
					Amount:  ptr.Ref(uint32(183)),
					HitType: types.HitTypeHit | types.HitTypePartialAbsorb,
				},
			},
			School: 0,
		}, pa)

		// Skipped because no guid
		_, err = exp[*messages.SkippedMessage](p.ParseContent(nil, time.Time{}, "Magma Totem III (Oku)'s Magma Totem hits Hateforge Miner for 54 Fire damage."))
		require.NoError(t, err)
	})

	t.Run("SpellAndSchool", func(t *testing.T) {
		ss, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x0000000000016541's Fire Strike hits 0x000000000001B1F2 for 2 Fire damage."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0x0000000000016541),
			SpellName: ptr.Ref("Fire Strike"),
			HitType:   types.HitTypeHit,
			Target:    0x000000000001B1F2,
			Amount:    2,
			Trailer:   nil,
			School:    types.FireSchool,
		}, ss)
	})

	t.Run("Resource Gain", func(t *testing.T) {
		rg, err := exp[*messages.ResourceChange](p.ParseContent(nil, time.Time{}, "0x000000000005B81F gains 20 Energy from 0x000000000005B81F's Relentless Strikes."))
		require.NoError(t, err)

		require.Equal(t, messages.ResourceChange{
			Target:    0x000000000005B81F,
			Amount:    20,
			Resource:  types.ResourceEnergy,
			Caster:    ptr.Ref[guid.GUID](0x000000000005B81F),
			SpellName: ptr.Ref("Relentless Strikes"),
			Direction: types.ChangeDirectionGain,
		}, rg)

		//msg, err := p.fGain(time.Time{}, "Testplayer gains Blood Pact (1).")
		//require.NoError(t, err)
		//require.Nil(t, msg)

		//rg, err = exp[ResourceChange](p.fGain(time.Time{}, "Naga (Kryaa) gains 35 Happiness from Kryaa 's Feed Pet Effect."))
		//require.NoError(t, err)
		//// Naga is the pet's name, Kryaa is the owner
		//require.Equal(t, "Naga (Kryaa)", rg.Target.Name)
		//require.Equal(t, uint32(35), rg.Amount)
		//require.Equal(t, "Happiness", rg.Resource)
		//require.Equal(t, "Kryaa", rg.Caster.Name)
		//require.Equal(t, "Feed Pet Effect", rg.Spell)
	})

	t.Run("PeriodicDamage", func(t *testing.T) {
		sh, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF130002F7F00CB61 suffers 13 Nature damage from 0x00000000000F5027's Insect Swarm. (4 resisted)"))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0x00000000000F5027),
			Target:    0xF130002F7F00CB61,
			Amount:    13,
			School:    types.NatureSchool,
			HitType:   types.HitTypePeriodic,
			SpellName: ptr.Ref("Insect Swarm"),
			Trailer: []types.TrailerEntry{
				{
					Amount:  ptr.Ref(uint32(4)),
					HitType: types.HitTypePartialResist,
				},
			},
		}, sh)
	})

	t.Run("Heal", func(t *testing.T) {
		sw, err := exp[*messages.Heal](p.ParseContent(nil, time.Time{}, "0x0000000000032723's Swiftmend critically heals 0x00000000000F4671 for 1819."))
		require.NoError(t, err)
		require.Equal(t, messages.Heal{
			MessageBase: messages.MessageBase{},
			Caster:      0x0000000000032723,
			Target:      0x00000000000F4671,
			SpellName:   "Swiftmend",
			Amount:      1819,
			HitType:     types.HitTypeCrit,
		}, sw)

		h, err := exp[*messages.Heal](p.ParseContent(nil, time.Time{}, "0x00000000000DF543's Lesser Healing Wave heals 0x0000000000024225 for 393."))
		require.NoError(t, err)
		require.Equal(t, messages.Heal{
			Caster:    0x00000000000DF543,
			Target:    0x0000000000024225,
			SpellName: "Lesser Healing Wave",
			Amount:    393,
			HitType:   types.HitTypeHit,
		}, h)

		hc, err := exp[*messages.Heal](p.ParseContent(nil, time.Time{}, "0x000000000001C80A's Flash Heal critically heals 0x0000000000024225 for 1048."))
		require.NoError(t, err)
		require.Equal(t, messages.Heal{
			Caster:    0x000000000001C80A,
			Target:    0x0000000000024225,
			SpellName: "Flash Heal",
			Amount:    1048,
			HitType:   types.HitTypeCrit,
		}, hc)

		hot, err := exp[*messages.ResourceChange](p.ParseContent(nil, time.Time{}, "0x000000000007C4E9 gains 303 health from 0x0000000000032723's Rejuvenation."))
		require.NoError(t, err)
		require.Equal(t, messages.ResourceChange{
			Target:    0x000000000007C4E9,
			Amount:    303,
			Resource:  types.ResourceHealth,
			Caster:    ptr.Ref(guid.GUID(0x0000000000032723)),
			SpellName: ptr.Ref("Rejuvenation"),
			Direction: types.ChangeDirectionGain,
		}, hot)
	})

	t.Run("Slain", func(t *testing.T) {
		sl, err := exp[*messages.Slain](p.ParseContent(nil, time.Time{}, "0xF130002D53024BA6 is slain by 0x000000000001C7AC!"))
		require.NoError(t, err)
		require.Equal(t, messages.Slain{
			Victim: 0xF130002D53024BA6,
			Killer: ptr.Ref[guid.GUID](0x000000000001C7AC),
		}, sl)

		death, err := exp[*messages.Slain](p.ParseContent(nil, time.Time{}, "0xF130001EA527931D is destroyed."))
		require.NoError(t, err)
		require.Equal(t, messages.Slain{
			Victim: 0xF130001EA527931D,
		}, death)

		pvp, err := exp[*messages.Slain](p.ParseContent(nil, time.Time{}, "0x000000000001C80A dies, honorable kill Rank: Knight-Champion  (Estimated Honor Points: 17)"))
		require.NoError(t, err)

		require.Equal(t, messages.Slain{
			Victim: 0x000000000001C80A,
			Killer: nil,
		}, pvp)

		xp, err := exp[*messages.Slain](p.ParseContent(nil, time.Time{}, "0xF1300010CA009C13 dies, 0x000000000001C7AC gains 100 experience. (+50 exp Rested bonus)"))
		require.NoError(t, err)
		require.Equal(t, messages.Slain{
			MessageBase: messages.MessageBase{},
			Victim:      0xF1300010CA009C13,
		}, xp)

		killed, err := exp[*messages.Slain](p.ParseContent(nil, time.Time{}, "0xF13000CBB227934D is killed by Fiery Hatching."))
		require.NoError(t, err)
		require.Equal(t, messages.Slain{
			MessageBase: messages.MessageBase{},
			Victim:      0xF13000CBB227934D,
		}, killed)

		dismissed, err := exp[*messages.Slain](p.ParseContent(nil, time.Time{}, "0x00000000000E3B4D's 0xF14009B5AD000004 is dismissed."))
		require.NoError(t, err)
		require.Equal(t, messages.Slain{
			Victim: 0xF14009B5AD000004,
			Killer: ptr.Ref[guid.GUID](0x00000000000E3B4D),
		}, dismissed)
	})

	t.Run("DamageReflect", func(t *testing.T) {
		dr, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x00000000000E6001 reflects 1 Arcane damage to 0x00000000000F2C1C."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:  ptr.Ref[guid.GUID](0x00000000000E6001),
			Target:  0x00000000000F2C1C,
			HitType: types.HitTypeReflect | types.HitTypeHit,
			Amount:  1,
			School:  types.ArcaneSchool,
			Trailer: nil,
		}, dr)
	})

	t.Run("SpellMiss", func(t *testing.T) {
		mis, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x00000000000AB2A9's Arcane Shot missed 0x000000000000D995."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0x00000000000AB2A9),
			SpellName: ptr.Ref("Arcane Shot"),
			HitType:   types.HitTypeMiss,
			Target:    0x000000000000D995,
			Amount:    0,
			Trailer:   nil,
		}, mis)
	})

	t.Run("SpellImmune", func(t *testing.T) {
		mis, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF130000A4627936B's Earthbind fails. 0x00000000000AE8FE is immune."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0xF130000A4627936B),
			SpellName: ptr.Ref("Earthbind"),
			HitType:   types.HitTypeImmune,
			Target:    0x00000000000AE8FE,
			Amount:    0,
			Trailer:   nil,
		}, mis)
	})

	t.Run("DamageImmune", func(t *testing.T) {
		mis, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x00000000000E5B85 attacks but 0xF13000ED412739B3 is immune."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:  ptr.Ref[guid.GUID](0x00000000000E5B85),
			HitType: types.HitTypeImmune,
			Target:  0xF13000ED412739B3,
			Amount:  0,
			School:  types.PhysicalSchool,
			Trailer: nil,
		}, mis)
	})

	t.Run("SpellAbsorb", func(t *testing.T) {
		mis, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF13000342E024B85's Shoot is absorbed by 0x0000000000024225."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0xF13000342E024B85),
			SpellName: ptr.Ref("Shoot"),
			HitType:   types.HitTypeFullAbsorb,
			Target:    0x0000000000024225,
			Amount:    0,
			Trailer:   nil,
		}, mis)
	})

	t.Run("FallDamage", func(t *testing.T) {
		fall, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x000000000001C7AC falls and loses 333 health."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Target:          0x000000000001C7AC,
			Amount:          333,
			HitType:         types.HitTypeEnvironment,
			EnvironmentType: ptr.Ref(types.EnvironmentTypeFall),
		}, fall)
	})

	t.Run("Dodge", func(t *testing.T) {
		dod, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF13000335300CF60 attacks. 0x00000000000E16AC dodges."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:  ptr.Ref[guid.GUID](0xF13000335300CF60),
			Target:  0x00000000000E16AC,
			HitType: types.HitTypeDodge,
			Amount:  0,
			School:  types.PhysicalSchool,
			Trailer: nil,
		}, dod)
	})

	t.Run("SpellSplit", func(t *testing.T) {
		split, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x00000000000D8985's Soul Link causes 0xF1400A5C5100000F 62 damage."))
		require.NoError(t, err)
		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0x00000000000D8985),
			Target:    0xF1400A5C5100000F,
			SpellName: ptr.Ref("Soul Link"),
			HitType:   types.HitTypeSplit,
			Amount:    62,
			School:    0,
			Trailer:   nil,
		}, split)
	})

	t.Run("SpellResist", func(t *testing.T) {
		dod, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x00000000000E16AC's Frost Shock was resisted by 0xF13000335300CF60."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			Caster:    ptr.Ref[guid.GUID](0x00000000000E16AC),
			Target:    0xF13000335300CF60,
			SpellName: ptr.Ref("Frost Shock"),
			HitType:   types.HitTypeFullResist,
			Amount:    0,
			School:    0,
			Trailer:   nil,
		}, dod)
	})

	t.Run("AuraGain", func(t *testing.T) {
		dod, err := exp[*messages.Aura](p.ParseContent(nil, time.Time{}, "0xF1400158E8000023 gains Strike Together (1)."))
		require.NoError(t, err)

		require.Equal(t, messages.Aura{
			Target:      0xF1400158E8000023,
			SpellName:   "Strike Together",
			Amount:      1,
			Application: types.AuraApplicationGains,
		}, dod)
	})

	t.Run("AuraRemoved", func(t *testing.T) {
		dod, err := exp[*messages.Aura](p.ParseContent(nil, time.Time{}, "0x00000000000CB034's Frost Shock is removed."))
		require.NoError(t, err)

		require.Equal(t, messages.Aura{
			Target:      0x00000000000CB034,
			SpellName:   "Frost Shock",
			Amount:      0,
			Application: types.AuraApplicationRemoved,
		}, dod)
	})

	t.Run("AuraFade", func(t *testing.T) {
		fade, err := exp[*messages.Aura](p.ParseContent(nil, time.Time{}, "Rejuvenation fades from 0x00000000000A2D75."))
		require.NoError(t, err)
		require.Equal(t, messages.Aura{
			Target:      0x00000000000A2D75,
			SpellName:   "Rejuvenation",
			Amount:      0,
			Application: types.AuraApplicationFades,
		}, fade)

		// Sometimes there is a double space?
		sp, err := exp[*messages.Aura](p.ParseContent(nil, time.Time{}, "0x0000000000049036 gains Shadow Protection  (1)."))
		require.NoError(t, err)
		require.Equal(t, messages.Aura{
			MessageBase: messages.MessageBase{},
			Target:      0x0000000000049036,
			SpellName:   "Shadow Protection",
			Amount:      1,
			Application: types.AuraApplicationGains,
		}, sp)

		sp, err = exp[*messages.Aura](p.ParseContent(nil, time.Time{}, "Shadow Protection  fades from 0x0000000000049036."))
		require.NoError(t, err)
		require.Equal(t, messages.Aura{
			MessageBase: messages.MessageBase{},
			Target:      0x0000000000049036,
			SpellName:   "Shadow Protection",
			Amount:      0,
			Application: types.AuraApplicationFades,
		}, sp)
	})

	t.Run("Interrupt", func(t *testing.T) {
		itr, err := exp[*messages.Interrupt](p.ParseContent(nil, time.Time{}, "0x00000000000F16FF interrupts 0x00000000000AA257's Flash Heal."))
		require.NoError(t, err)

		require.Equal(t, messages.Interrupt{
			Caster:    0x00000000000F16FF,
			Target:    0x00000000000AA257,
			SpellName: "Flash Heal",
		}, itr)
	})

	t.Run("Creates", func(t *testing.T) {
		crt, err := exp[*messages.Create](p.ParseContent(nil, time.Time{}, "0x0000000000024225 creates Runecloth Bandage."))
		require.NoError(t, err)

		require.Equal(t, messages.Create{
			Caster:  0x0000000000024225,
			Created: "Runecloth Bandage",
		}, crt)
	})

	t.Run("SkipNamedCast", func(f *testing.T) {
		_, err := exp[*messages.SkippedMessage](p.ParseContent(nil, time.Time{}, "CAST: Aeowar begins to cast Swift Red Rocket Car(45050)."))
		require.NoError(t, err)
	})

	t.Run("DurabilityLoss", func(t *testing.T) {
		_, err := exp[*messages.SkippedMessage](p.ParseContent(nil, time.Time{}, "0x000000000001C7AC's equipped items suffer a 10% durability loss."))
		require.NoError(t, err)
	})

	t.Run("ResourceDrain", func(t *testing.T) {
		re, err := exp[*messages.ResourceChange](p.ParseContent(nil, time.Time{}, "0x0000000000095229's Arcane Power drains 58 Mana from 0x0000000000095229."))
		require.NoError(t, err)

		require.Equal(t, messages.ResourceChange{
			Target:    0x0000000000095229,
			Amount:    58,
			Resource:  types.ResourceMana,
			Caster:    ptr.Ref(guid.GUID(0x0000000000095229)),
			SpellName: ptr.Ref("Arcane Power"),
			Direction: types.ChangeDirectionLoss,
		}, re)
	})

	t.Run("Gains Attack", func(t *testing.T) {
		rg, err := exp[*messages.ExtraAttack](p.ParseContent(nil, time.Time{}, "0x00000000000523FD gains 2 extra attacks through Windfury Weapon."))
		require.NoError(t, err)

		require.Equal(t, messages.ExtraAttack{
			Caster:        0x00000000000523FD,
			Amount:        2,
			FromSpellName: "Windfury Weapon",
		}, rg)
	})

	t.Run("Pet Eat", func(t *testing.T) {
		_, err := exp[*messages.SkippedMessage](p.ParseContent(nil, time.Time{}, "0x00000000000F8E0C's pet begins eating a Roasted Quail."))
		require.NoError(t, err)
	})

	t.Run("Reputation", func(t *testing.T) {
		_, err := exp[*messages.SkippedMessage](p.ParseContent(nil, time.Time{}, "0x000000000001C80A's Hydraxian Waterlords reputation has increased by 20."))
		require.NoError(t, err)
	})

	t.Run("LavaSwimming", func(t *testing.T) {
		dmg, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0x00000000000D8985 loses 344 health for swimming in lava. (152 resisted) (114 absorbed)"))
		require.NoError(t, err)
		require.Equal(t, messages.Damage{
			SpellName:       nil,
			Caster:          nil,
			Target:          0x00000000000D8985,
			HitType:         types.HitTypeEnvironment,
			Amount:          344,
			School:          types.NoneSchool,
			EnvironmentType: ptr.Ref(types.EnvironmentTypeLava),
			Trailer: types.Trailer{
				{
					Amount:  ptr.Ref(uint32(152)),
					HitType: types.HitTypePartialResist,
				},
				{
					Amount:  ptr.Ref(uint32(114)),
					HitType: types.HitTypePartialAbsorb,
				},
			},
		}, dmg)
	})

	t.Run("FullResist", func(t *testing.T) {
		_, err := exp[*messages.SkippedMessage](p.ParseContent(nil, time.Time{}, "0xF130002F5600DD1D's Lucifron's Curse was resisted."))
		require.NoError(t, err)
	})

	t.Run("FullImmune", func(t *testing.T) {
		dmg, err := exp[*messages.Damage](p.ParseContent(nil, time.Time{}, "0xF130000059279638 is immune to 0xF13000FDFC278C2C's Molten Bulwark."))
		require.NoError(t, err)

		require.Equal(t, messages.Damage{
			SpellName:       ptr.Ref("Molten Bulwark"),
			Caster:          ptr.Ref[guid.GUID](0xF13000FDFC278C2C),
			Target:          0xF130000059279638,
			HitType:         types.HitTypeImmune,
			Amount:          0,
			School:          0,
			Trailer:         nil,
			EnvironmentType: nil,
		}, dmg)
	})

	//t.Run("Parry", func(t *testing.T) {
	//	par, err := exp[*messages.Damage](p.ParseContent(nil,time.Time{}, "0xF1300011BC009C68's Kick was parried by 0x000000000001C7AC."))
	//	require.NoError(t, err)
	//
	//	require.Equal(t, messages.Damage{
	//		MessageBase:     messages.MessageBase{},
	//		SpellName:       nil,
	//		Caster:          nil,
	//		Target:          0,
	//		HitType:         0,
	//		Amount:          0,
	//		School:          types.NoneSchool,
	//		Trailer:         nil,
	//		EnvironmentType: nil,
	//	}, par)
	//})
}

func TestPreProcess(t *testing.T) {
	t.Parallel()

	pre := youReplacer{Me: (&whoami.SharedMe{}).SetMe(types.Unit{
		Name: "Doyd",
		Gid:  0x000000000001C7AC,
	})}

	tc := []struct {
		input    string
		expected string
	}{
		{
			input:    "nochange",
			expected: "nochange",
		},
		{
			input:    "Your Greater Heal heals 0x000000000002A904 for 2460",
			expected: "0x000000000001C7AC's Greater Heal heals 0x000000000002A904 for 2460",
		},
		{
			input:    "You gain 16 Mana from Holy Champion",
			expected: "0x000000000001C7AC gains 16 Mana from 0x000000000001C7AC's Holy Champion",
		},
	}

	for _, test := range tc {
		t.Run(test.input, func(t *testing.T) {
			result, err := pre.Preprocess(test.input)
			require.NoError(t, err)
			require.Equal(t, test.expected, result)
		})
	}
}

func exp[T messages.Message](msg []messages.Message, err error) (T, error) {
	var empty T

	if err != nil {
		return empty, err
	}

	if len(msg) == 0 {
		return empty, err
	}

	if len(msg) > 1 {
		return msg[0].(T), fmt.Errorf("expected single message, got %d", len(msg))
	}

	return msg[0].(T), err
}
