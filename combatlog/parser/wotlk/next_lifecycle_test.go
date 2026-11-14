package wotlk

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNextPipelineSplitFilesMatchContinuousStatefulSynthetics(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		format database.LogFormat
		flavor database.WoWFlavor
		suffix string
	}{
		{name: "tbc", format: database.LogFormat243CcAddon, flavor: database.WoWFlavor{database.FlavorTBC}, suffix: "1000,nil"},
		{name: "wrath", format: database.LogFormat335aCcAddon, flavor: database.WoWFlavor{database.FlavorWrath}, suffix: "1000,0,0,nil"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := nextLifecycleContext(t, tc.format, tc.flavor)
			lines := []string{
				nativeHealLine("20:40:08.481", tc.suffix),
				nativeHealLine("20:40:08.482", tc.suffix),
			}

			continuous, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
			require.NoError(t, err)
			clock := realmclock.Info{
				LocalTime: time.Date(2026, time.January, 14, 20, 0, 0, 0, time.UTC),
				UTCTime:   time.Date(2026, time.January, 14, 20, 0, 0, 0, time.UTC),
			}
			continuous.SetRealmClockInfo(&clock)
			continuousSource, err := continuous.OpenFile(strings.NewReader(strings.Join(lines, "\n")))
			require.NoError(t, err)
			continuousMessages := drainNextSource(t, ctx, continuousSource)

			split, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
			require.NoError(t, err)
			split.SetRealmClockInfo(&clock)
			var splitMessages []messages.Message
			for _, line := range lines {
				source, err := split.OpenFile(strings.NewReader(line))
				require.NoError(t, err)
				splitMessages = append(splitMessages, drainNextSource(t, ctx, source)...)
			}

			require.Equal(t, continuousMessages, splitMessages)
			assert.Equal(t, 1, countNewOwners(continuousMessages), "pet ownership synthetic must retain duplicate-suppression state across files")
			assert.Equal(t, int64(2), split.Metrics().TotalLinesParsed)
		})
	}
}

func TestNextPipelineSerialSourceLifecycle(t *testing.T) {
	t.Parallel()
	ctx := nextLifecycleContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})
	pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
	require.NoError(t, err)

	first, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.481")))
	require.NoError(t, err)
	_, err = pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.482")))
	require.ErrorContains(t, err, "previous file")
	drainNextSource(t, ctx, first)

	second, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.482")))
	require.NoError(t, err)
	_, err = first.Advance(ctx)
	require.ErrorContains(t, err, "no longer the active file")
	drainNextSource(t, ctx, second)
	assert.Equal(t, int64(2), pipeline.Metrics().TotalLinesParsed)
}

func TestNextPipelineCancellationAndMalformedRecordsAreRecoverable(t *testing.T) {
	t.Parallel()
	ctx := nextLifecycleContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})
	pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
	require.NoError(t, err)
	input := strings.Join([]string{
		`1/14 20:40:08.481  SPELL_DAMAGE,invalid,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,1000,0,20,0,0,0,nil,nil,nil`,
		nativeDamageLine("20:40:08.482"),
	}, "\n")
	source, err := pipeline.OpenFile(strings.NewReader(input))
	require.NoError(t, err)

	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = source.Advance(canceled)
	require.ErrorIs(t, err, context.Canceled)

	_, err = source.Advance(ctx)
	require.Error(t, err)
	require.False(t, parseerrors.IsFatalError(err))

	batch, err := source.Advance(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, batch)
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)

	next, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.483")))
	require.NoError(t, err)
	drainNextSource(t, ctx, next)
}

func TestNextPipelineFatalIngestionPreventsReuse(t *testing.T) {
	t.Parallel()
	ctx := nextLifecycleContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})
	pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
	require.NoError(t, err)
	source, err := pipeline.OpenFile(failingReader{err: errors.New("read failed")})
	require.NoError(t, err)

	_, err = source.Advance(ctx)
	require.Error(t, err)
	require.True(t, parseerrors.IsFatalError(err))
	fatalErr := err

	_, err = source.Advance(ctx)
	require.EqualError(t, err, fatalErr.Error())
	_, err = pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.481")))
	require.ErrorContains(t, err, "cannot be reused after fatal error")
}

func TestNextPipelineSyntheticFailurePreventsReuse(t *testing.T) {
	t.Parallel()
	ctx := nextLifecycleContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})
	pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
	require.NoError(t, err)
	pipeline.synthetics = failingNextSynthetic{err: errors.New("synthetic failed")}
	source, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.481")))
	require.NoError(t, err)

	_, err = source.Advance(ctx)
	require.EqualError(t, err, "processing synthetics: synthetic failed")
	_, err = source.Advance(ctx)
	require.EqualError(t, err, "processing synthetics: synthetic failed")
	_, err = pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.482")))
	require.ErrorContains(t, err, "cannot be reused after fatal error")
}

func TestNextPipelineTerminalErrorsPropagateThroughConsumers(t *testing.T) {
	t.Parallel()
	ctx := nextLifecycleContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})

	for _, tc := range []struct {
		name string
		err  error
	}{
		{name: "ordinary synthetic error", err: errors.New("synthetic failed")},
		{name: "synthetic EOF", err: io.EOF},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
			require.NoError(t, err)
			pipeline.synthetics = failingNextSynthetic{err: tc.err}
			source, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.481")))
			require.NoError(t, err)

			consumerSet := consumers.New(slog.Default())
			err = consumerSet.ConsumeAll(ctx, source)
			require.Error(t, err)
			require.True(t, parseerrors.IsFatalError(err))
			require.ErrorContains(t, err, "fatal parser error: processing synthetics")
		})
	}

	t.Run("stale source", func(t *testing.T) {
		t.Parallel()
		pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
		require.NoError(t, err)
		first, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.481")))
		require.NoError(t, err)
		drainNextSource(t, ctx, first)
		second, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.482")))
		require.NoError(t, err)

		consumerSet := consumers.New(slog.Default())
		_, err = consumerSet.Advance(ctx, first)
		require.Error(t, err)
		require.True(t, parseerrors.IsFatalError(err))
		require.ErrorContains(t, err, "fatal parser error: source is no longer the active file")
		drainNextSource(t, ctx, second)
	})
}

func TestNextPipelinePreservesClockNamesAndCapabilitiesAcrossFiles(t *testing.T) {
	t.Parallel()
	ctx := nextLifecycleContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})
	pipeline, err := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
	require.NoError(t, err)
	pipeline.SetRealmClockInfo(&realmclock.Info{
		LocalTime: time.Date(2026, time.January, 14, 20, 0, 0, 0, time.UTC),
		UTCTime:   time.Date(2026, time.January, 15, 2, 0, 0, 0, time.UTC),
		Offset:    6 * time.Hour,
	})

	failedType := "[1RG:" + strings.Repeat(",", messages.RaidGroupCount*messages.RaidGroupSize-1) + "]"
	companionLine := fmt.Sprintf(`1/14 20:40:08.481  SPELL_CAST_FAILED,0x00000000000019CA,"Mage",0x512,0x00000000000019CA,"Mage",0x512,1,"Companion",0x1,"%s"`, failedType)
	first, err := pipeline.OpenFile(strings.NewReader(companionLine))
	require.NoError(t, err)
	firstMessages := drainNextSource(t, ctx, first)
	require.NotEmpty(t, firstMessages)
	assert.True(t, pipeline.SawRaidGroup())
	assert.True(t, first.SawRaidGroup())

	second, err := pipeline.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.482")))
	require.NoError(t, err)
	secondMessages := drainNextSource(t, ctx, second)
	assert.True(t, second.SawRaidGroup())
	name, ok := pipeline.native.GUIDName(guid.GUID(0x19CA))
	require.True(t, ok)
	assert.Equal(t, "Mage", name)

	var damage *messages.Damage
	for _, message := range secondMessages {
		if decoded, ok := message.(*messages.Damage); ok {
			damage = decoded
			break
		}
	}
	require.NotNil(t, damage)
	assert.Equal(t, time.Date(2026, time.January, 15, 2, 40, 8, 482_000_000, time.UTC), damage.Date())
}

func nextLifecycleContext(t *testing.T, format database.LogFormat, flavor database.WoWFlavor) context.Context {
	t.Helper()
	return parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor})
}

func nativeHealLine(clock, suffix string) string {
	return fmt.Sprintf(`1/14 %s  SPELL_HEAL,0x0000000000001234,"Hunter",0x512,0xF1400367E6000009,"Pet",0x1114,48990,"Mend Pet",0x8,%s`, clock, suffix)
}

func nativeDamageLine(clock string) string {
	return fmt.Sprintf(`1/14 %s  SPELL_DAMAGE,0x00000000000019CA,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,1000,0,20,0,0,0,nil,nil,nil`, clock)
}

func drainNextSource(t *testing.T, ctx context.Context, source *NextSource) []messages.Message {
	t.Helper()
	var result []messages.Message
	for {
		batch, err := source.Advance(ctx)
		if errors.Is(err, io.EOF) {
			return result
		}
		require.NoError(t, err)
		result = append(result, batch...)
	}
}

func countNewOwners(batch []messages.Message) int {
	count := 0
	for _, message := range batch {
		if _, ok := message.(*messages.NewOwner); ok {
			count++
		}
	}
	return count
}

type failingReader struct{ err error }

func (r failingReader) Read([]byte) (int, error) { return 0, r.err }

type failingNextSynthetic struct{ err error }

func (s failingNextSynthetic) ProcessMessages([]messages.Message) ([]messages.Message, error) {
	return nil, s.err
}

func (failingNextSynthetic) DetailedTimes() map[string]time.Duration { return nil }
