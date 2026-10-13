package reorder_test

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/stretchr/testify/require"
)

func TestProcessorReordersEncounterEndAfterKillingBlow(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.September, 29, 13, 52, 44, 0, time.UTC)
	boss := guid.GUID(0xF130000E5A23E843)
	player := guid.GUID(0x0000120C006422B6)

	boundary := &messages.EncounterBoundary{
		MessageBase: messages.Base(base.Add(195 * time.Millisecond)),
		Name:        "Skum",
		Active:      false,
	}
	damage := &messages.Damage{
		MessageBase: messages.Base(base.Add(194 * time.Millisecond)),
		Caster:      &player,
		Target:      boss,
		Amount:      34,
		Overkill:    6,
	}
	slain := &messages.Slain{
		MessageBase: messages.Base(base.Add(194 * time.Millisecond)),
		Killer:      &player,
		Victim:      boss,
	}
	later := messages.TimedOut(base.Add(4 * time.Second))

	source := &batchAdvancer{batches: [][]messages.Message{
		{boundary},
		{damage},
		{slain},
		{later},
	}}
	processor := reorder.New(source, 3*time.Second)

	got := collectAll(t, processor)
	require.Equal(t, []messages.Message{damage, slain, boundary, later}, got)
}

func TestProcessorFlushesBufferedMessagesAtEOF(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.September, 29, 13, 52, 44, 0, time.UTC)
	first := messages.TimedOut(base.Add(time.Second))
	second := messages.TimedOut(base)

	processor := reorder.New(&batchAdvancer{batches: [][]messages.Message{
		{first},
		{second},
	}}, 3*time.Second)

	got := collectAll(t, processor)
	require.Equal(t, []messages.Message{second, first}, got)
}

func TestProcessorPropagatesSourceErrors(t *testing.T) {
	t.Parallel()

	want := errors.New("parse failed")
	processor := reorder.New(errorAdvancer{err: want}, 3*time.Second)

	batch, err := processor.Advance(t.Context())
	require.ErrorIs(t, err, want)
	require.Empty(t, batch)
}

func collectAll(t *testing.T, processor *reorder.Processor) []messages.Message {
	t.Helper()

	var got []messages.Message
	for {
		batch, err := processor.Advance(t.Context())
		got = append(got, batch...)
		if errors.Is(err, io.EOF) {
			return got
		}
		require.NoError(t, err)
	}
}

type errorAdvancer struct {
	err error
}

func (a errorAdvancer) Advance(context.Context) ([]messages.Message, error) {
	return nil, a.err
}

type batchAdvancer struct {
	batches [][]messages.Message
	next    int
}

func (a *batchAdvancer) Advance(context.Context) ([]messages.Message, error) {
	if a.next >= len(a.batches) {
		return nil, io.EOF
	}
	batch := a.batches[a.next]
	a.next++
	return batch, nil
}
