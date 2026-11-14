package consumers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"time"

	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// GraphRecipe is trusted, position-specific configuration, never selected by an archive.
// Validate must reject every unsupported concrete consumer and must not mutate it.
type GraphRecipe struct {
	ID       string
	Validate func(Consumer) error
}

// GraphRuntime separates fallible, non-mutating preflight from runtime attachment.
// Wire must only attach runtime dependencies, not execute gameplay or factories.
// A failed Wire permanently leaves the root unusable; restore a fresh graph to retry.
type GraphRuntime struct {
	ID        string
	Preflight func(Consumer) error
	Wire      func(Consumer) error
}

// ValidateGraphOrder checks canonical owner identity without exposing the
// mutable consumer list. Graph consumers must be comparable owner pointers.
func (c *Consumers) ValidateGraphOrder(expected ...Consumer) error {
	if len(c.list) != len(expected) {
		return fmt.Errorf("consumer root order/count mismatch")
	}
	for i, actual := range c.list {
		if actual == nil || !reflect.TypeOf(actual).Comparable() || actual != expected[i] {
			return fmt.Errorf("consumer root owner mismatch at %d", i)
		}
	}
	return nil
}

type graphEntry struct {
	Recipe string `json:"recipe"`
	Ref    string `json:"ref"`
}
type graphState struct {
	Consumers []graphEntry `json:"consumers"`
}

func RegisterGraphOwner(r *ownergraph.Registry, recipes []GraphRecipe) error {
	recipes = append([]GraphRecipe(nil), recipes...)
	for i, recipe := range recipes {
		if recipe.ID == "" || recipe.Validate == nil {
			return fmt.Errorf("incomplete consumer recipe %d", i)
		}
	}
	validate := func(c *Consumers) error {
		if c.graphPending && c.graphWireAttempted {
			return fmt.Errorf("consumer runtime wiring failed")
		}
		if c.Advancer != nil {
			return fmt.Errorf("consumer source advancer is outside graph scope")
		}
		if len(c.list) != len(recipes) {
			return fmt.Errorf("consumer recipe count mismatch")
		}
		for i, consumer := range c.list {
			if consumer == nil {
				return fmt.Errorf("nil consumer %d", i)
			}
			if err := recipes[i].Validate(consumer); err != nil {
				return fmt.Errorf("consumer %d: %w", i, err)
			}
		}
		return nil
	}
	return ownergraph.Register(r, ownergraph.Codec[Consumers]{Type: "consumers.ordered", Version: 1,
		Init: func() *Consumers { return new(Consumers) },
		Capture: func(c *Consumers, ctx *ownergraph.Capture) ([]byte, error) {
			if err := validate(c); err != nil {
				return nil, err
			}
			state := graphState{Consumers: make([]graphEntry, len(c.list))}
			for i, v := range c.list {
				ref, err := ctx.Ref(v)
				if err != nil {
					return nil, err
				}
				state.Consumers[i] = graphEntry{recipes[i].ID, ref}
			}
			return json.Marshal(state)
		},
		Restore: func(c *Consumers, version uint32, b []byte, ctx *ownergraph.Restore) error {
			if version != 1 {
				return fmt.Errorf("unsupported consumer graph version %d", version)
			}
			var state graphState
			if err := decodeGraph(b, &state); err != nil {
				return err
			}
			if state.Consumers == nil || len(state.Consumers) != len(recipes) {
				return fmt.Errorf("consumer order/count mismatch")
			}
			list := make([]Consumer, len(recipes))
			for i, entry := range state.Consumers {
				if entry.Recipe != recipes[i].ID || entry.Ref == "" {
					return fmt.Errorf("consumer recipe/reference mismatch at %d", i)
				}
				v, err := ownergraph.Loader[Consumer](ctx)(entry.Ref)
				if err != nil {
					return err
				}
				list[i] = v
			}
			*c = Consumers{list: list, time: make(map[string]time.Duration), graphPending: true, graphRecipes: append([]GraphRecipe(nil), recipes...)}
			return validate(c)
		}, Validate: validate,
	})
}

func (c *Consumers) WireGraphRuntime(logger *slog.Logger, runtime []GraphRuntime) error {
	if c == nil || !c.graphPending || c.graphWireAttempted {
		return fmt.Errorf("consumer graph is not awaiting wiring")
	}
	if logger == nil || c.Advancer != nil || len(runtime) != len(c.graphRecipes) {
		return fmt.Errorf("incomplete consumer runtime")
	}
	for i, wire := range runtime {
		if wire.ID != c.graphRecipes[i].ID || wire.Preflight == nil || wire.Wire == nil {
			return fmt.Errorf("invalid consumer runtime %d", i)
		}
		if err := c.graphRecipes[i].Validate(c.list[i]); err != nil {
			return err
		}
		if err := wire.Preflight(c.list[i]); err != nil {
			return err
		}
	}
	c.graphWireAttempted = true
	for i, wire := range runtime {
		if err := wire.Wire(c.list[i]); err != nil {
			return fmt.Errorf("wire consumer %d: %w", i, err)
		}
	}
	c.logger = logger
	c.graphPending = false
	return nil
}

// Reject duplicate keys as well as unknown fields, missing fields and trailing data.
func decodeGraph(b []byte, out any) error {
	var check func(*json.Decoder) error
	check = func(d *json.Decoder) error {
		token, err := d.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				key, err := d.Token()
				if err != nil {
					return err
				}
				k := key.(string)
				if seen[k] {
					return fmt.Errorf("duplicate field %s", k)
				}
				seen[k] = true
				if err := check(d); err != nil {
					return err
				}
			}
		case '[':
			for d.More() {
				if err := check(d); err != nil {
					return err
				}
			}
		default:
			return fmt.Errorf("invalid JSON delimiter")
		}
		_, err = d.Token()
		return err
	}
	d := json.NewDecoder(bytes.NewReader(b))
	if err := check(d); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	d = json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	return d.Decode(out)
}
