package vanillaparser

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

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

	//t.Run("Spell Cast Attempt", func(t *testing.T) {
	//	att, err := exp[SpellCastAttempt](p.fSpellCastAttempt(time.Time{}, "Randgriz begins to cast Flash Heal."))
	//	require.NoError(t, err)
	//	require.Equal(t, "Randgriz", att.Caster.Name)
	//	require.Equal(t, "Flash Heal", att.SpellName)
	//})

	// With school: 0xF1400844930090A2's Firebolt hits 0xF130000950003FB5 for 38 Fire damage
	t.Run("SpellHit", func(t *testing.T) {
		sh, err := exp[SpellDamage](p.fDamageSpellHitOrCritNoSchool(time.Time{}, "0x0000000000062A1B's Hamstring hits 0xF1300033F000CFD0 for 27."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0x0000000000062A1B,
			SpellName: types.Spell{Name: "Hamstring"},
			HitType:   types.HitTypeHit,
			Target:    0xF1300033F000CFD0,
			Amount:    27,
			Trailer:   nil,
		}, sh)
	})

	t.Run("SpellAndSchool", func(t *testing.T) {
		ss, err := exp[SpellDamage](p.fDamageSpellHitOrCritSchool(time.Time{}, "0x0000000000016541's Fire Strike hits 0x000000000001B1F2 for 2 Fire damage."))
		require.NoError(t, err)

		require.Equal(t, SpellDamage{
			Caster:    0x0000000000016541,
			SpellName: types.Spell{Name: "Fire Strike"},
			HitType:   types.HitTypeHit,
			Target:    0x000000000001B1F2,
			Amount:    2,
			Trailer:   nil,
			School:    types.FireSchool,
		}, ss)
	})

	t.Run("Resource Gain", func(t *testing.T) {
		rg, err := exp[ResourceChange](p.fGainSource(time.Time{}, "0x000000000005B81F gains 20 Energy from 0x000000000005B81F's Relentless Strikes."))
		require.NoError(t, err)

		require.Equal(t, ResourceChange{
			Target:    0x000000000005B81F,
			Amount:    20,
			Resource:  types.ResourceEnergy,
			Caster:    0x000000000005B81F,
			SpellName: types.Spell{Name: "Relentless Strikes"},
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
	if len(msg) == 0 {
		var empty T
		return empty, err
	}

	if len(msg) > 1 {
		return msg[0].(T), fmt.Errorf("expected single message, got %d", len(msg))
	}

	return msg[0].(T), err
}
