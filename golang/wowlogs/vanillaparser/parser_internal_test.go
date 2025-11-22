package vanillaparser

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/golang/internal/ptr"
	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"
	"github.com/stretchr/testify/require"
)

func TestParserMessages(t *testing.T) {
	t.Parallel()

	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())
	p, err := New(logger, strings.NewReader(""))
	require.NoError(t, err)
	p.state = NewState(logger, types.Unit{})

	//t.Run("Spell Cast Attempt", func(t *testing.T) {
	//	att, err := exp[SpellCastAttempt](p.fSpellCastAttempt(time.Time{}, "Randgriz begins to cast Flash Heal."))
	//	require.NoError(t, err)
	//	require.Equal(t, "Randgriz", att.Caster.Name)
	//	require.Equal(t, "Flash Heal", att.SpellName)
	//})

	// With school: 0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage
	t.Run("SpellHit", func(t *testing.T) {
		sh, err := exp[SpellDamage](p.parseContent(time.Time{}, "0x0000000000062A1B's Hamstring hits 0xF1300033F000CFD0 for 27."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0x0000000000062A1B,
			SpellName: "Hamstring",
			HitType:   types.HitTypeHit,
			Target:    0xF1300033F000CFD0,
			Amount:    27,
			Trailer:   nil,
		}, sh)

		pa, err := exp[SpellDamage](p.parseContent(time.Time{}, "0xF13000342E024B85's Shoot hits 0x0000000000024225 for 0. (183 absorbed)"))
		require.NoError(t, err)
		require.Equal(t, SpellDamage{
			Caster:    0xF13000342E024B85,
			SpellName: "Shoot",
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
	})

	t.Run("SpellAndSchool", func(t *testing.T) {
		ss, err := exp[SpellDamage](p.parseContent(time.Time{}, "0x0000000000016541's Fire Strike hits 0x000000000001B1F2 for 2 Fire damage."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0x0000000000016541,
			SpellName: "Fire Strike",
			HitType:   types.HitTypeHit,
			Target:    0x000000000001B1F2,
			Amount:    2,
			Trailer:   nil,
			School:    types.FireSchool,
		}, ss)
	})

	t.Run("Resource Gain", func(t *testing.T) {
		rg, err := exp[ResourceChange](p.parseContent(time.Time{}, "0x000000000005B81F gains 20 Energy from 0x000000000005B81F's Relentless Strikes."))
		require.NoError(t, err)

		require.Equal(t, ResourceChange{
			Target:    0x000000000005B81F,
			Amount:    20,
			Resource:  types.ResourceEnergy,
			Caster:    ptr.Ref[guid.GUID](0x000000000005B81F),
			SpellName: ptr.Ref("Relentless Strikes"),
			Direction: "gains",
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
		sh, err := exp[PeriodicDamage](p.parseContent(time.Time{}, "0xF130002F7F00CB61 suffers 13 Nature damage from 0x00000000000F5027's Insect Swarm. (4 resisted)"))
		require.NoError(t, err)

		require.Equal(t, PeriodicDamage{
			Caster:    0x00000000000F5027,
			Target:    0xF130002F7F00CB61,
			Amount:    13,
			School:    types.NatureSchool,
			SpellName: "Insect Swarm",
			Trailer: []types.TrailerEntry{
				{
					Amount:  ptr.Ref(uint32(4)),
					HitType: types.HitTypePartialResist,
				},
			},
		}, sh)
	})

	t.Run("Heal", func(t *testing.T) {
		h, err := exp[Heal](p.parseContent(time.Time{}, "0x00000000000DF543's Lesser Healing Wave heals 0x0000000000024225 for 393."))
		require.NoError(t, err)
		require.Equal(t, Heal{
			Caster:    0x00000000000DF543,
			Target:    0x0000000000024225,
			SpellName: "Lesser Healing Wave",
			Amount:    393,
			HitType:   types.HitTypeHit,
		}, h)

		hc, err := exp[Heal](p.parseContent(time.Time{}, "0x000000000001C80A's Flash Heal critically heals 0x0000000000024225 for 1048."))
		require.NoError(t, err)
		require.Equal(t, Heal{
			Caster:    0x000000000001C80A,
			Target:    0x0000000000024225,
			SpellName: "Flash Heal",
			Amount:    1048,
			HitType:   types.HitTypeCrit,
		}, hc)
	})

	t.Run("Slain", func(t *testing.T) {
		sl, err := exp[Slain](p.parseContent(time.Time{}, "0xF130002D53024BA6 is slain by 0x000000000001C7AC!"))
		require.NoError(t, err)
		require.Equal(t, Slain{
			Victim: 0xF130002D53024BA6,
			Killer: ptr.Ref[guid.GUID](0x000000000001C7AC),
		}, sl)

		death, err := exp[Slain](p.parseContent(time.Time{}, "0xF130001EA527931D is destroyed."))
		require.NoError(t, err)
		require.Equal(t, Slain{
			Victim: 0xF130001EA527931D,
		}, death)

		pvp, err := exp[Slain](p.parseContent(time.Time{}, "0x000000000001C80A dies, honorable kill Rank: Knight-Champion  (Estimated Honor Points: 17)"))
		require.NoError(t, err)

		require.Equal(t, Slain{
			Victim: 0x000000000001C80A,
			Killer: nil,
		}, pvp)
	})

	t.Run("DamageReflect", func(t *testing.T) {
		dr, err := exp[Damage](p.parseContent(time.Time{}, "0x00000000000E6001 reflects 1 Arcane damage to 0x00000000000F2C1C."))
		require.NoError(t, err)

		require.Equal(t, Damage{
			Caster:  0x00000000000E6001,
			Target:  0x00000000000F2C1C,
			HitType: types.HitTypeReflect | types.HitTypeHit,
			Amount:  1,
			School:  types.ArcaneSchool,
			Trailer: nil,
		}, dr)
	})

	t.Run("SpellMiss", func(t *testing.T) {
		mis, err := exp[SpellDamage](p.parseContent(time.Time{}, "0x00000000000AB2A9's Arcane Shot missed 0x000000000000D995."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0x00000000000AB2A9,
			SpellName: "Arcane Shot",
			HitType:   types.HitTypeMiss,
			Target:    0x000000000000D995,
			Amount:    0,
			Trailer:   nil,
		}, mis)
	})

	t.Run("SpellImmune", func(t *testing.T) {
		mis, err := exp[SpellDamage](p.parseContent(time.Time{}, "0xF130000A4627936B's Earthbind fails. 0x00000000000AE8FE is immune."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0xF130000A4627936B,
			SpellName: "Earthbind",
			HitType:   types.HitTypeImmune,
			Target:    0x00000000000AE8FE,
			Amount:    0,
			Trailer:   nil,
		}, mis)
	})

	t.Run("DamageImmune", func(t *testing.T) {
		mis, err := exp[Damage](p.parseContent(time.Time{}, "0x00000000000E5B85 attacks but 0xF13000ED412739B3 is immune."))
		require.NoError(t, err)

		require.Equal(t, Damage{
			Caster:  0x00000000000E5B85,
			HitType: types.HitTypeImmune,
			Target:  0xF13000ED412739B3,
			Amount:  0,
			Trailer: nil,
		}, mis)
	})

	t.Run("SpellAbsorb", func(t *testing.T) {
		mis, err := exp[SpellDamage](p.parseContent(time.Time{}, "0xF13000342E024B85's Shoot is absorbed by 0x0000000000024225."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0xF13000342E024B85,
			SpellName: "Shoot",
			HitType:   types.HitTypeFullAbsorb,
			Target:    0x0000000000024225,
			Amount:    0,
			Trailer:   nil,
		}, mis)
	})

	t.Run("FallDamage", func(t *testing.T) {
		fall, err := exp[Damage](p.parseContent(time.Time{}, "0x000000000001C7AC falls and loses 333 health."))
		require.NoError(t, err)

		require.Equal(t, FallDamage{
			MessageBase: MessageBase{},
			Target:      0x000000000001C7AC,
			Amount:      333,
		}, fall)
	})

	t.Run("Dodge", func(t *testing.T) {
		dod, err := exp[Damage](p.parseContent(time.Time{}, "0xF13000335300CF60 attacks. 0x00000000000E16AC dodges"))
		require.NoError(t, err)

		require.Equal(t, Damage{
			Caster:  0xF13000335300CF60,
			Target:  0x00000000000E16AC,
			HitType: types.HitTypeDodge,
			Amount:  0,
			School:  0,
			Trailer: nil,
		}, dod)
	})

	t.Run("SpellResist", func(t *testing.T) {
		dod, err := exp[SpellDamage](p.parseContent(time.Time{}, "0x00000000000E16AC's Frost Shock was resisted by 0xF13000335300CF60"))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0x00000000000E16AC,
			Target:    0xF13000335300CF60,
			SpellName: "Frost Shock",
			HitType:   types.HitTypeFullResist,
			Amount:    0,
			School:    0,
			Trailer:   nil,
		}, dod)
	})

	t.Run("AuraGain", func(t *testing.T) {
		dod, err := exp[Aura](p.parseContent(time.Time{}, "0xF1400158E8000023 gains Strike Together (1)."))
		require.NoError(t, err)

		require.Equal(t, Aura{
			Target:      0xF1400158E8000023,
			SpellName:   "Strike Together",
			Amount:      1,
			Application: types.AuraApplicationGains,
		}, dod)
	})

	t.Run("AuraRemoved", func(t *testing.T) {
		dod, err := exp[Aura](p.parseContent(time.Time{}, "0x00000000000CB034's Frost Shock is removed."))
		require.NoError(t, err)

		require.Equal(t, Aura{
			Target:      0x00000000000CB034,
			SpellName:   "Frost Shock",
			Amount:      0,
			Application: types.AuraApplicationRemoved,
		}, dod)
	})

	t.Run("Interrupt", func(t *testing.T) {
		itr, err := exp[Aura](p.parseContent(time.Time{}, "0x00000000000F16FF interrupts 0x00000000000AA257's Flash Heal."))
		require.NoError(t, err)

		require.Equal(t, Interrupt{
			Caster:    0x00000000000F16FF,
			Target:    0x00000000000AA257,
			SpellName: "Flash Heal",
		}, itr)
	})

	t.Run("Creates", func(t *testing.T) {
		crt, err := exp[Create](p.parseContent(time.Time{}, "0x0000000000024225 creates Runecloth Bandage."))
		require.NoError(t, err)

		require.Equal(t, Create{
			Caster:  0x0000000000024225,
			Created: "Runecloth Bandage",
		}, crt)
	})

	//t.Run("Gains Attack", func(t *testing.T) {
	//	rg, err := exp[SkippedMessage](p.fGainsAttack(time.Time{}, "Lonsell gains 1 extra attack through Windfury Totem."))
	//	require.NoError(t, err)
	//	var _ = rg
	//})
}

//func TestParseRealLogs(t *testing.T) {
//	t.Parallel()
//
//	t.Skip("expected to fail")
//
//	logFile, err := os.OpenFile("testdata/reallogs/MoltenCore.txt", os.O_RDONLY, 0644)
//	require.NoError(t, err)
//	// nolint:errcheck
//	defer logFile.Close()
//
//	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
//	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())
//	p := NewParser(logger)
//
//	failed := map[string]error{}
//	scanner := bufio.NewScanner(logFile)
//	for scanner.Scan() {
//		line := scanner.Text()
//		msg, err := p.LogLine(line)
//		if err != nil {
//			failed[line] = err
//			continue
//		}
//
//		if sm, ok := msg[0].(SkippedMessage); ok {
//			var _ = sm
//			continue
//		}
//		//fmt.Printf("%s: %s\n", reflect.TypeOf(msg).String(), msg[0].String())
//	}
//
//	failedList := []string{}
//	for line, err := range failed {
//		failedList = append(failedList, "\n"+line)
//		var _ = err
//		//failedList = append(failedList, fmt.Sprintf("\nLine: %s\n  Error: %v", line, err))
//	}
//	require.Empty(t, failedList)
//}

func exp[T Message](msg []Message, err error) (T, error) {
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
