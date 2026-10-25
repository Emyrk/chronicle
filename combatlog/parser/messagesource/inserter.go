package messagesource

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// Inserter merges an ordered artifact source into an ordered original source.
// Original messages win timestamp ties. Order within each source is unchanged.
type Inserter struct {
	original MessageSource
	inserted MessageSource

	originalState sourceState
	insertedState sourceState
}

type sourceState struct {
	buffer  []messages.Message
	eof     bool
	hasLast bool
	last    time.Time
}

func NewInserter(original, inserted MessageSource) *Inserter {
	return &Inserter{original: original, inserted: inserted}
}

func (i *Inserter) Advance(ctx context.Context) ([]messages.Message, error) {
	if err := fill(ctx, i.original, &i.originalState, "original"); err != nil {
		return nil, err
	}
	if err := fill(ctx, i.inserted, &i.insertedState, "inserted"); err != nil {
		return nil, err
	}

	original := i.originalState.buffer
	inserted := i.insertedState.buffer
	if len(original) == 0 && len(inserted) == 0 {
		return nil, io.EOF
	}

	if len(original) == 0 {
		i.insertedState.buffer = nil
		return inserted, nil
	}
	if len(inserted) == 0 {
		i.originalState.buffer = nil
		return original, nil
	}

	if inserted[0].Date().Before(original[0].Date()) {
		end := 1
		for end < len(inserted) && inserted[end].Date().Before(original[0].Date()) {
			end++
		}
		out := inserted[:end]
		i.insertedState.buffer = inserted[end:]
		return out, nil
	}

	// Originals win equal timestamps. Return every original that belongs before
	// the next inserted message, preserving its batch order.
	end := 1
	for end < len(original) && !original[end].Date().After(inserted[0].Date()) {
		end++
	}
	out := original[:end]
	i.originalState.buffer = original[end:]
	return out, nil
}

func fill(ctx context.Context, source MessageSource, state *sourceState, name string) error {
	for len(state.buffer) == 0 && !state.eof {
		if err := ctx.Err(); err != nil {
			return err
		}
		batch, err := source.Advance(ctx)
		if err != nil && !errors.Is(err, io.EOF) {
			return fmt.Errorf("advance %s source: %w", name, err)
		}
		for index, message := range batch {
			if message == nil {
				return fmt.Errorf("%s source returned nil message at batch index %d", name, index)
			}
			if state.hasLast && message.Date().Before(state.last) {
				return fmt.Errorf("%s source timestamp regression: %s before %s", name, message.Date(), state.last)
			}
			state.last = message.Date()
			state.hasLast = true
		}
		state.buffer = batch
		if errors.Is(err, io.EOF) {
			state.eof = true
		}
	}
	return nil
}
