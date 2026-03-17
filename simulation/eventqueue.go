package simulation

import "container/heap"

// SimEvent represents a scheduled event in the simulation.
type SimEvent struct {
	TimeMs    int32
	Type      EventType
	SpellID   int32
	EffectIdx int
	seqNo     int64 // tie-breaker for same-time events
}

// eventQueue is a min-heap of SimEvents ordered by TimeMs then seqNo.
type eventQueue struct {
	events []SimEvent
}

func newEventQueue() *eventQueue {
	q := &eventQueue{}
	heap.Init(q)
	return q
}

func (q *eventQueue) Len() int { return len(q.events) }

func (q *eventQueue) Less(i, j int) bool {
	if q.events[i].TimeMs == q.events[j].TimeMs {
		return q.events[i].seqNo < q.events[j].seqNo
	}
	return q.events[i].TimeMs < q.events[j].TimeMs
}

func (q *eventQueue) Swap(i, j int) {
	q.events[i], q.events[j] = q.events[j], q.events[i]
}

func (q *eventQueue) Push(x interface{}) {
	q.events = append(q.events, x.(SimEvent))
}

func (q *eventQueue) Pop() interface{} {
	old := q.events
	n := len(old)
	e := old[n-1]
	q.events = old[:n-1]
	return e
}

func (q *eventQueue) push(e SimEvent) {
	heap.Push(q, e)
}

func (q *eventQueue) pop() (SimEvent, bool) {
	if q.Len() == 0 {
		return SimEvent{}, false
	}
	return heap.Pop(q).(SimEvent), true
}

func (q *eventQueue) peek() (SimEvent, bool) {
	if q.Len() == 0 {
		return SimEvent{}, false
	}
	return q.events[0], true
}

// Remove removes all events matching the predicate.
func (q *eventQueue) remove(predicate func(SimEvent) bool) {
	filtered := q.events[:0]
	for _, e := range q.events {
		if !predicate(e) {
			filtered = append(filtered, e)
		}
	}
	q.events = filtered
	heap.Init(q)
}
