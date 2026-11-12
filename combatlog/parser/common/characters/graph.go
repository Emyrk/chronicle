package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
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
	Factories  TrustedFactoryRecipe
	Identifier identifier.TrustedRecipe
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
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Characters]{Type: CharactersStateType, Version: CharactersStateVersion, Init: func() *Characters { return new(Characters) }, Capture: func(c *Characters, ctx *ownergraph.Capture) ([]byte, error) {
				if len(c.hooks) != 0 || c.phaseTransitionCb != nil || c.noKnownParticipantsAlive != nil {
					return nil, fmt.Errorf("character graph runtime callbacks require explicit recipe wiring")
				}
				s, e := c.CaptureState(ownergraph.Reference[Character](ctx), ctx.Ref)
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
				return c.RestoreState(s, options.Factories, db, id, ownergraph.Loader[Character](ctx), ctx.Resolve)
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
func (c *Base[M]) WireGraphPeriodHook(h period.Hook)   { c.Activity.WireHook(h) }
func (c *NeverActive) WireGraphPeriodHook(period.Hook) {}
func (c *Characters) WireGraphRuntime() error {
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
	if e := c.WireStateRuntime(CharactersRuntime{}); e != nil {
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
	Base    string        `json:"base"`
	ID      guid.GUID     `json:"id"`
	Timeout time.Duration `json:"timeout"`
}

func (c *Common) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if c == nil || c.Base == nil {
		return nil, fmt.Errorf("nil Common/base")
	}
	if c.timeoutAsDeathIf != nil {
		return nil, fmt.Errorf("Common timeout callback requires trusted graph adapter")
	}
	base, e := ctx.Ref(c.Base)
	if e != nil {
		return nil, e
	}
	return json.Marshal(commonGraphValue{base, c.ID(), c.timeout})
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
	*c = Common{Base: base, timeout: v.Timeout}
	return nil
}
