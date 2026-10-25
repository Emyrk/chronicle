package messagesource

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// Inserter adds an artifact source to an original source by timestamp when the
// next messages are comparable. Original messages win timestamp ties. Order
// within each source is unchanged, including timestamp regressions caused by
// clock-anchor changes between sessions.
type Inserter struct {
	original MessageSource
	inserted MessageSource

	originalState sourceState
	insertedState sourceState

	hasOriginalWatermark bool
	originalWatermark    time.Time
}

type sourceState struct {
	buffer []messages.Message
	eof    bool
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
		return i.takeOriginal(len(original)), nil
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

	// Originals win equal timestamps. If the original stream regresses, preserve
	// that regression, but first release inserted messages that were waiting at
	// the prior original timestamp.
	end := 0
	watermark, hasWatermark := i.originalWatermark, i.hasOriginalWatermark
	for end < len(original) {
		date := original[end].Date()
		if hasWatermark && date.Before(watermark) && !inserted[0].Date().After(watermark) {
			break
		}
		if date.After(inserted[0].Date()) {
			break
		}
		watermark, hasWatermark = date, true
		end++
	}
	if end > 0 {
		return i.takeOriginal(end), nil
	}

	end = 1
	for end < len(inserted) && !inserted[end].Date().After(i.originalWatermark) {
		end++
	}
	out := inserted[:end]
	i.insertedState.buffer = inserted[end:]
	return out, nil
}

func (i *Inserter) takeOriginal(end int) []messages.Message {
	out := i.originalState.buffer[:end]
	i.originalState.buffer = i.originalState.buffer[end:]
	i.originalWatermark = out[len(out)-1].Date()
	i.hasOriginalWatermark = true
	return out
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
		}
		state.buffer = batch
		if errors.Is(err, io.EOF) {
			state.eof = true
		}
	}
	return nil
}
