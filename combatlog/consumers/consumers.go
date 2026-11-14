package consumers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
)

type Consumer interface {
	Process(m messages.Message) error
}

type detailedTimingConsumer interface {
	DetailedTimes() map[string]time.Duration
}

type Consumers struct {
	graphPending       bool
	graphWireAttempted bool
	graphRecipes       []GraphRecipe
	logger             *slog.Logger
	list               []Consumer
	Advancer           Advancer

	time map[string]time.Duration
}

func New(logger *slog.Logger, consumers ...Consumer) *Consumers {
	return &Consumers{
		logger: logger,
		list:   consumers,
		time:   make(map[string]time.Duration),
	}
}

func (c Consumers) Times() map[string]time.Duration {
	times := maps.Clone(c.time)
	// Merge advancer detailed times (parser sub-timings)
	if dt, ok := c.Advancer.(detailedTimingConsumer); ok {
		for name, duration := range dt.DetailedTimes() {
			times[name] += duration
		}
	}
	// Merge consumer detailed times
	for _, consumer := range c.list {
		detailedTimes, ok := consumer.(detailedTimingConsumer)
		if !ok {
			continue
		}
		for name, duration := range detailedTimes.DetailedTimes() {
			times[name] += duration
		}
	}
	return times
}

type Advancer interface {
	Advance(ctx context.Context) ([]messages.Message, error)
}

func (c Consumers) ConsumeAll(ctx context.Context, p Advancer) error {
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		_, err := c.Advance(ctx, p)
		if err != nil {
			if errors.Is(err, io.EOF) && !parseerrors.IsFatalError(err) {
				return nil
			}
			return err
		}
	}
}

func (c Consumers) Advance(ctx context.Context, p Advancer) ([]messages.Message, error) {
	if c.graphPending {
		return nil, fmt.Errorf("consumers graph runtime is not wired")
	}
	now := time.Now()
	msgs, err := p.Advance(ctx)
	c.time["parser"] += time.Since(now)
	if err != nil {
		if parseerrors.IsFatalError(err) {
			return nil, fmt.Errorf("fatal parser error: %w", err)
		}
		if errors.Is(err, io.EOF) {
			return nil, io.EOF
		}
		c.logger.Error("Error advancing parser", slog.String("error", err.Error()))
	}

	for _, msg := range msgs {
		if err := c.Process(msg); err != nil {
			return nil, err
		}
	}
	return msgs, nil
}

// Process delivers a message in the configured order.
func (c Consumers) Process(msg messages.Message) error {
	if c.graphPending {
		return fmt.Errorf("consumers graph runtime is not wired")
	}
	for _, consumer := range c.list {
		now := time.Now()
		err := consumer.Process(msg)
		c.time[fmt.Sprintf("%T", consumer)] += time.Since(now)
		if err != nil {
			return fmt.Errorf("consumer process: %w", err)
		}
	}
	return nil
}
