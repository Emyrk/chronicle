package parser

import (
	"bufio"
	"fmt"
	"log/slog"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"
	"github.com/stretchr/testify/require"
)

func TestParserMessages(t *testing.T) {
	t.Parallel()

	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())
	p := NewParser(logger)

	t.Run("Spell Cast Attempt", func(t *testing.T) {
		att, err := exp[SpellCastAttempt](p.spellCastAttempt(time.Time{}, "Randgriz begins to cast Flash Heal."))
		require.NoError(t, err)
		require.Equal(t, "Randgriz", att.Caster.Name)
		require.Equal(t, "Flash Heal", att.SpellName)
	})

	t.Run("Resourec Gain", func(t *testing.T) {
		rg, err := exp[ResourceGain](p.gain(time.Time{}, "Corta gains 589 health from Randgriz 's Renew."))
		require.NoError(t, err)
		require.Equal(t, "Corta", rg.Target.Name)
		require.Equal(t, uint32(589), rg.Amount)
		require.Equal(t, "health", rg.Resource)
		require.Equal(t, "Randgriz", rg.Caster.Name)
		require.Equal(t, "Renew", rg.Spell)

		msg, err := p.gain(time.Time{}, "Testplayer gains Blood Pact (1).")
		require.NoError(t, err)
		require.Nil(t, msg)

		rg, err = exp[ResourceGain](p.gain(time.Time{}, "Naga (Kryaa) gains 35 Happiness from Kryaa 's Feed Pet Effect."))
		require.NoError(t, err)
		// Naga is the pet's name, Kryaa is the owner
		require.Equal(t, "Naga (Kryaa)", rg.Target.Name)
		require.Equal(t, uint32(35), rg.Amount)
		require.Equal(t, "Happiness", rg.Resource)
		require.Equal(t, "Kryaa", rg.Caster.Name)
		require.Equal(t, "Feed Pet Effect", rg.Spell)
	})
}

func TestParseRealLogs(t *testing.T) {
	t.Parallel()

	logFile, err := os.OpenFile("testdata/reallogs/MoltenCore.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)
	defer logFile.Close()

	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())
	p := NewParser(logger)

	scanner := bufio.NewScanner(logFile)
	for scanner.Scan() {
		line := scanner.Text()
		msg, err := p.LogLine(line)
		require.NoError(t, err)

		if _, ok := msg.(SkippedMessage); ok {
			continue
		}
		fmt.Printf("%s: %s\n", reflect.TypeOf(msg).String(), msg.String())
	}
}

func exp[T Message](msg Message, err error) (T, error) {
	if msg == nil {
		var empty T
		return empty, err
	}
	return msg.(T), err
}
