// Package reorder provides a bounded timestamp reorder buffer for parsed
// combat-log messages.
package reorder

import (
	"container/heap"
	"context"
	"errors"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// Advancer produces the next batch of parsed combat-log messages.
type Advancer interface {
	Advance(context.Context) ([]messages.Message, error)
}

// Processor reorders messages within a bounded time window. Messages with the
// same timestamp retain their original order except that damage precedes death
// for the same unit and encounter-end boundaries come last.
type Processor struct {
	source Advancer
	window time.Duration

	buffer  messageHeap
	ordinal uint64
	latest  time.Time
	eof     bool
}

// New wraps source with a bounded timestamp reorder buffer.
func New(source Advancer, window time.Duration) *Processor {
	if window < 0 {
		window = 0
	}
	return &Processor{source: source, window: window}
}

// Advance returns all messages that are older than the current reorder
// watermark. At EOF, it flushes every buffered message before returning EOF on
// the following call.
func (p *Processor) Advance(ctx context.Context) ([]messages.Message, error) {
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		if p.eof {
			if p.buffer.Len() == 0 {
				return nil, io.EOF
			}
			return p.popBefore(time.Time{}, true), nil
		}

		if ready := p.popBefore(p.latest.Add(-p.window), false); len(ready) > 0 {
			return ready, nil
		}

		batch, err := p.source.Advance(ctx)
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, err
		}
		for _, msg := range batch {
			heap.Push(&p.buffer, queuedMessage{message: msg, ordinal: p.ordinal})
			p.ordinal++
			if msg.Date().After(p.latest) {
				p.latest = msg.Date()
			}
		}

		if errors.Is(err, io.EOF) {
			p.eof = true
		}
	}
}

func (p *Processor) popBefore(watermark time.Time, all bool) []messages.Message {
	var queued []queuedMessage
	for p.buffer.Len() > 0 {
		next := p.buffer[0]
		if !all && next.message.Date().After(watermark) {
			break
		}
		queued = append(queued, heap.Pop(&p.buffer).(queuedMessage))
	}

	ready := make([]messages.Message, 0, len(queued))
	for len(queued) > 0 {
		end := 1
		for end < len(queued) && queued[end].message.Date().Equal(queued[0].message.Date()) {
			end++
		}
		ready = append(ready, orderSameTimestamp(queued[:end])...)
		queued = queued[end:]
	}
	return ready
}

func orderSameTimestamp(group []queuedMessage) []messages.Message {
	remainingDamage := make(map[guid.GUID]int)
	for _, queued := range group {
		if damage, ok := queued.message.(*messages.Damage); ok {
			remainingDamage[damage.Target]++
		}
	}

	ordered := make([]messages.Message, 0, len(group))
	pendingDeaths := make(map[guid.GUID][]messages.Message)
	var encounterEnds []messages.Message
	for _, queued := range group {
		msg := queued.message
		if isEncounterEnd(msg) {
			encounterEnds = append(encounterEnds, msg)
			continue
		}

		if damage, ok := msg.(*messages.Damage); ok {
			ordered = append(ordered, msg)
			remainingDamage[damage.Target]--
			if remainingDamage[damage.Target] == 0 {
				ordered = append(ordered, pendingDeaths[damage.Target]...)
				delete(pendingDeaths, damage.Target)
			}
			continue
		}

		if victim, isDeath := deathVictim(msg); isDeath && remainingDamage[victim] > 0 {
			pendingDeaths[victim] = append(pendingDeaths[victim], msg)
			continue
		}
		ordered = append(ordered, msg)
	}

	return append(ordered, encounterEnds...)
}

func isEncounterEnd(msg messages.Message) bool {
	boundary, ok := msg.(*messages.EncounterBoundary)
	return ok && !boundary.Active
}

func deathVictim(msg messages.Message) (guid.GUID, bool) {
	switch death := msg.(type) {
	case *messages.Slain:
		return death.Victim, true
	case *messages.UnitDied:
		return death.ID, true
	default:
		return 0, false
	}
}

type queuedMessage struct {
	message messages.Message
	ordinal uint64
}

type messageHeap []queuedMessage

func (h messageHeap) Len() int { return len(h) }

func (h messageHeap) Less(i, j int) bool {
	left, right := h[i], h[j]
	if left.message.Date().Equal(right.message.Date()) {
		return left.ordinal < right.ordinal
	}
	return left.message.Date().Before(right.message.Date())
}

func (h messageHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }

func (h *messageHeap) Push(value any) {
	*h = append(*h, value.(queuedMessage))
}

func (h *messageHeap) Pop() any {
	old := *h
	last := len(old) - 1
	value := old[last]
	old[last] = queuedMessage{}
	*h = old[:last]
	return value
}
