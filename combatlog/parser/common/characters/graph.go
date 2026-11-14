package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"reflect"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// GraphOptions are trusted construction dependencies, not archive-selected
// recipes. The initial bounded graph supports Common/NeverActive/Room owners.
// Unknown concrete characters, spells and callbacks fail closed.
type GraphOptions struct {
	Factories TrustedFactoryRecipe
	// Identifier is retained for source compatibility only. Identifier dependencies
	// are restored through canonical graph references using the explicit allowlist
	// passed to identifier.RegisterGraphOwner, not this singleton recipe.
	// Deprecated: register identifier recipes with identifier.RegisterGraphOwner.
	Identifier identifier.TrustedRecipe
	// ValidateRuntime admits only callbacks belonging to a trusted enclosing owner.
	// Without it, capture rejects all runtime callbacks.
	ValidateRuntime func(*Characters) error
}
type graphValue struct {
	State json.RawMessage   `json:"state"`
	Refs  map[string]string `json:"refs"`
}

func graphPayload(state interface{ Encode() ([]byte, error) }, refs map[string]string) ([]byte, error) {
	data, e := state.Encode()
	if e != nil {
		return nil, e
	}
	return json.Marshal(graphValue{data, refs})
}
func graphDecode(data []byte) (graphValue, error) {
	var v graphValue
	e := decodeCharacterValue(data, &v)
	return v, e
}
func RegisterGraphOwners(r *ownergraph.Registry, options GraphOptions) error {
	registrations := []func() error{
		func() error { return registerNeverActiveValueGraphOwner(r) },
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Characters]{Type: CharactersStateType, Version: CharactersStateVersion, Init: func() *Characters { return new(Characters) }, Capture: func(c *Characters, ctx *ownergraph.Capture) ([]byte, error) {
				if len(c.hooks) != 0 || c.phaseTransitionCb != nil || c.noKnownParticipantsAlive != nil {
					if options.ValidateRuntime == nil {
						return nil, fmt.Errorf("character graph runtime callbacks require explicit recipe wiring")
					}
					if err := options.ValidateRuntime(c); err != nil {
						return nil, err
					}
				}
				s, e := c.CaptureState(graphCharacterReference(ctx), ctx.Ref)
				if e != nil {
					return nil, e
				}
				db, e := ctx.Ref(c.db)
				if e != nil {
					return nil, e
				}
				id, e := ctx.Ref(c.idf)
				if e != nil {
					return nil, e
				}
				return graphPayload(s, map[string]string{"units": db, "identifier": id})
			}, Restore: func(c *Characters, v uint32, b []byte, ctx *ownergraph.Restore) error {
				g, e := graphDecode(b)
				if e != nil {
					return e
				}
				s, e := DecodeCharactersState(v, g.State)
				if e != nil {
					return e
				}
				db, e := ownergraph.LoadAs[*unitdb.Units](ctx, g.Refs["units"])
				if e != nil {
					return e
				}
				id, e := ownergraph.LoadAs[*identifier.Identifier](ctx, g.Refs["identifier"])
				if e != nil {
					return e
				}
				return c.RestoreState(s, options.Factories, db, id, graphCharacterLoader(ctx), ctx.Resolve)
			}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Base[*period.InactivityPeriod]]{Type: BaseStateType + ".Inactivity", Version: BaseStateVersion, Init: func() *Base[*period.InactivityPeriod] { return new(Base[*period.InactivityPeriod]) }, Capture: func(c *Base[*period.InactivityPeriod], ctx *ownergraph.Capture) ([]byte, error) {
				s, e := c.CaptureState(ownergraph.Reference[*period.InactivityPeriod](ctx), ownergraph.Reference[messages.Message](ctx))
				if e != nil {
					return nil, e
				}
				lookup, e := ctx.Ref(c.lookup)
				if e != nil {
					return nil, e
				}
				return graphPayload(s, map[string]string{"lookup": lookup})
			}, Restore: func(c *Base[*period.InactivityPeriod], v uint32, b []byte, ctx *ownergraph.Restore) error {
				g, e := graphDecode(b)
				if e != nil {
					return e
				}
				s, e := DecodeBaseState(v, g.State)
				if e != nil {
					return e
				}
				lookup, e := ownergraph.ResolveAs[*Characters](ctx, g.Refs["lookup"])
				if e != nil {
					return e
				}
				return c.RestoreState(s, lookup, ownergraph.Loader[*period.InactivityPeriod](ctx), ownergraph.Loader[messages.Message](ctx))
			}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Common]{Type: CommonStateType, Version: CommonStateVersion, Init: func() *Common { return new(Common) }, Capture: (*Common).captureGraphState, Restore: (*Common).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[NeverActive]{Type: NeverActiveStateType, Version: NeverActiveStateVersion, Init: func() *NeverActive { return new(NeverActive) }, Capture: func(c *NeverActive, _ *ownergraph.Capture) ([]byte, error) { return c.CaptureState().Encode() }, Restore: func(c *NeverActive, v uint32, b []byte, _ *ownergraph.Restore) error {
				s, e := DecodeNeverActiveState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s)
			}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Room]{Type: RoomStateType, Version: RoomStateVersion, Init: func() *Room { return new(Room) }, Capture: func(c *Room, ctx *ownergraph.Capture) ([]byte, error) {
				s, e := c.CaptureState(ownergraph.Reference[*RoomMechanic](ctx))
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *Room, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeRoomState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ownergraph.Resolver[*RoomMechanic](ctx))
			}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[RoomMechanic]{Type: RoomMechanicStateType, Version: RoomMechanicStateVersion, Init: func() *RoomMechanic { return new(RoomMechanic) }, Capture: func(c *RoomMechanic, ctx *ownergraph.Capture) ([]byte, error) {
				s, e := c.CaptureState(ownergraph.Reference[*Common](ctx), ownergraph.Reference[*Room](ctx), ownergraph.Reference[messages.Message](ctx))
				if e != nil {
					return nil, e
				}
				all, e := ctx.Ref(c.all)
				if e != nil {
					return nil, e
				}
				return graphPayload(s, map[string]string{"all": all})
			}, Restore: func(c *RoomMechanic, v uint32, b []byte, ctx *ownergraph.Restore) error {
				g, e := graphDecode(b)
				if e != nil {
					return e
				}
				s, e := DecodeRoomMechanicState(v, g.State)
				if e != nil {
					return e
				}
				all, e := ownergraph.ResolveAs[*Characters](ctx, g.Refs["all"])
				if e != nil {
					return e
				}
				return c.RestoreState(s, all, ownergraph.Loader[*Common](ctx), ownergraph.Resolver[*Room](ctx), ownergraph.Loader[messages.Message](ctx))
			}})
		},
	}
	for _, register := range registrations {
		if e := register(); e != nil {
			return e
		}
	}
	return nil
}

// WireGraphRuntime attaches only this aggregate's period observers after graph
// validation. Concrete characters declare their collector through the method,
// rather than a central switch guessing embedded owner layout.
func (c *Base[M]) WireGraphPeriodHook(h period.Hook)  { c.Activity.WireHook(h) }
func (c NeverActive) WireGraphPeriodHook(period.Hook) {}
func (c *Characters) WireGraphRuntime() error {
	return c.WireGraphRuntimeWith(CharactersRuntime{})
}

// WireGraphRuntimeWith installs configured callbacks and period observers once,
// after graph validation, without invoking callbacks.
func (c *Characters) WireGraphRuntimeWith(runtime CharactersRuntime) error {
	if c == nil || c.All == nil {
		return fmt.Errorf("Characters not initialized")
	}
	var entries []Character
	if e := c.All.ForEach(func(ch Character) error {
		if _, ok := ch.(interface{ WireGraphPeriodHook(period.Hook) }); !ok {
			return fmt.Errorf("unsupported runtime period owner %T", ch)
		}
		entries = append(entries, ch)
		return nil
	}); e != nil {
		return e
	}
	if e := c.WireStateRuntime(runtime); e != nil {
		return e
	}
	for _, ch := range entries {
		ch.(interface{ WireGraphPeriodHook(period.Hook) }).WireGraphPeriodHook(period.HookFunction(func(messages.Message) {
			if c.activityChanged == nil {
				c.activityChanged = map[Character]struct{}{}
			}
			c.activityChanged[ch] = struct{}{}
		}))
	}
	return nil
}

func RegisterAdsGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[AdsGoWithBoss]{Type: AdsGoWithBossStateType, Version: AdsGoWithBossStateVersion, Init: func() *AdsGoWithBoss { return new(AdsGoWithBoss) }, Capture: func(c *AdsGoWithBoss, ctx *ownergraph.Capture) ([]byte, error) {
		s, e := c.CaptureState(ownergraph.Reference[CharacterBase](ctx))
		if e != nil {
			return nil, e
		}
		all, e := ctx.Ref(c.all)
		if e != nil {
			return nil, e
		}
		return graphPayload(s, map[string]string{"all": all})
	}, Restore: func(c *AdsGoWithBoss, v uint32, b []byte, ctx *ownergraph.Restore) error {
		g, e := graphDecode(b)
		if e != nil {
			return e
		}
		s, e := DecodeAdsGoWithBossState(v, g.State)
		if e != nil {
			return e
		}
		all, e := ownergraph.ResolveAs[*Characters](ctx, g.Refs["all"])
		if e != nil {
			return e
		}
		return c.RestoreState(s, ownergraph.Loader[CharacterBase](ctx), all)
	}, Validate: func(c *AdsGoWithBoss) error {
		if _, ok := c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }); !ok {
			return fmt.Errorf("unsupported wrapped runtime period owner")
		}
		return nil
	}})
}
func (c *AdsGoWithBoss) WireGraphPeriodHook(h period.Hook) {
	c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }).WireGraphPeriodHook(h)
}

// Common's graph form owns only Common-local state. Its older standalone codec
// embeds a Base payload; using that here would capture the Base twice. The graph
// has one canonical Base Value, declared by this reference instead.
type commonGraphValue struct {
	Base          string        `json:"base"`
	ID            guid.GUID     `json:"id"`
	Timeout       time.Duration `json:"timeout"`
	TimeoutRecipe string        `json:"timeout_recipe,omitempty"`
	TimeoutEntry  uint32        `json:"timeout_entry,omitempty"`
}

func (c *Common) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if c == nil || c.Base == nil {
		return nil, fmt.Errorf("nil Common/base")
	}
	if c.timeoutAsDeathIf != nil && c.timeoutRecipe == "" {
		return nil, fmt.Errorf("Common timeout callback requires trusted graph adapter")
	}
	if c.timeoutRecipe != "" {
		if e := c.ValidateTimeoutRecipe(); e != nil {
			return nil, e
		}
	}
	base, e := ctx.Ref(c.Base)
	if e != nil {
		return nil, e
	}
	return json.Marshal(commonGraphValue{Base: base, ID: c.ID(), Timeout: c.timeout, TimeoutRecipe: c.timeoutRecipe, TimeoutEntry: c.timeoutEntry})
}
func (c *Common) restoreGraphState(version uint32, data []byte, ctx *ownergraph.Restore) error {
	if version != CommonStateVersion {
		return fmt.Errorf("unsupported Common graph version")
	}
	var v commonGraphValue
	if e := decodeCharacterValue(data, &v); e != nil {
		return e
	}
	base, e := ownergraph.LoadAs[*Base[*period.InactivityPeriod]](ctx, v.Base)
	if e != nil {
		return e
	}
	if base.ID() != v.ID {
		return fmt.Errorf("Common base identity mismatch")
	}
	*c = Common{Base: base, timeout: v.Timeout, timeoutRecipe: v.TimeoutRecipe, timeoutEntry: v.TimeoutEntry}
	if c.timeoutRecipe != "" || c.timeoutEntry != 0 {
		return c.ValidateTimeoutRecipe()
	}
	return nil
}

// BindGraphRuntime records a trusted enclosing owner's current callback setup.
// Callers must validate their own callback provenance before binding. Hook
// identities are checked directly, never by function code addresses.
func (c *Characters) BindGraphRuntime(owner any, expectedHooks []SetHook) error {
	if c == nil || c.restoreRuntime != nil {
		return fmt.Errorf("Characters not ready for runtime binding")
	}
	v := reflect.ValueOf(owner)
	if !v.IsValid() || v.Kind() != reflect.Pointer || v.IsNil() {
		return fmt.Errorf("runtime owner must be a nonnil pointer")
	}
	if len(c.hooks) != len(expectedHooks) {
		return fmt.Errorf("runtime hook count mismatch")
	}
	for i, hook := range c.hooks {
		actual, expected := reflect.ValueOf(hook), reflect.ValueOf(expectedHooks[i])
		if !actual.IsValid() || !expected.IsValid() || actual.Kind() != reflect.Pointer || expected.Kind() != reflect.Pointer || actual.IsNil() || expected.IsNil() || actual.Type() != expected.Type() || actual.Pointer() != expected.Pointer() {
			return fmt.Errorf("runtime hook %d identity mismatch", i)
		}
	}
	c.graphRuntimeOwner = owner
	c.graphRuntimeRevision = c.runtimeRevision
	return nil
}

// GraphRuntimeOwner fails closed after any callback setter or hook registration,
// even when the replacement has the same shape as the bound runtime.
func (c *Characters) GraphRuntimeOwner() (any, error) {
	if c == nil || c.graphRuntimeOwner == nil || c.restoreRuntime != nil || c.graphRuntimeRevision != c.runtimeRevision {
		return nil, fmt.Errorf("character graph runtime is unbound or changed")
	}
	return c.graphRuntimeOwner, nil
}

func (c *Characters) GraphDependencies() (*unitdb.Units, *identifier.Identifier) {
	return c.db, c.idf
}

// GraphRuntimeShape reports the required shape before restored runtime wiring,
// and the installed shape afterward. It does not invoke callbacks.
func (c *Characters) GraphRuntimeShape() (hooks int, participants bool, phase bool) {
	if c.restoreRuntime != nil {
		return c.restoreRuntime.Hooks, c.restoreRuntime.Participants, c.restoreRuntime.Phase
	}
	return len(c.hooks), c.noKnownParticipantsAlive != nil, c.phaseTransitionCb != nil
}

// BindGraphRuntimeWithHook atomically appends a hook and binds its trusted owner.
// Failed validation leaves both the hook list and binding unchanged.
func (c *Characters) BindGraphRuntimeWithHook(owner any, expectedHooks []SetHook, hook SetHook) error {
	if c == nil {
		return fmt.Errorf("Characters not ready for runtime binding")
	}
	next := *c
	next.hooks = append([]SetHook(nil), c.hooks...)
	next.RegisterHook(hook)
	if err := next.BindGraphRuntime(owner, expectedHooks); err != nil {
		return err
	}
	*c = next
	return nil
}
