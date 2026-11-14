package characters

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterWrapperGraphOwners registers explicit owner-local codecs without replaying factories.
func RegisterWrapperGraphOwners(r *ownergraph.Registry) error {
	registrations := []func() error{
		func() error { return registerScriptedDefeatGraphOwner(r) },
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[PermanentDeath]{Type: PermanentDeathStateType, Version: PermanentDeathStateVersion, Init: func() *PermanentDeath { return new(PermanentDeath) },
				Capture: func(c *PermanentDeath, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[CharacterBase](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *PermanentDeath, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodePermanentDeathState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[CharacterBase](ctx))
				}, Validate: func(c *PermanentDeath) error { return validateWrappedPeriod(c.CharacterBase) }})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[StartsNewFight]{Type: StartsNewFightStateType, Version: StartsNewFightStateVersion, Init: func() *StartsNewFight { return new(StartsNewFight) },
				Capture: func(c *StartsNewFight, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[CharacterBase](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *StartsNewFight, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeStartsNewFightState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[CharacterBase](ctx))
				}, Validate: func(c *StartsNewFight) error { return validateWrappedPeriod(c.CharacterBase) }})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[DeathOnCast]{Type: DeathOnCastStateType, Version: DeathOnCastStateVersion, Init: func() *DeathOnCast { return new(DeathOnCast) },
				Capture: func(c *DeathOnCast, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[CharacterBase](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *DeathOnCast, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeDeathOnCastState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[CharacterBase](ctx))
				}, Validate: func(c *DeathOnCast) error { return validateWrappedPeriod(c.CharacterBase) }})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[IgnoreCast]{Type: IgnoreCastStateType, Version: IgnoreCastStateVersion, Init: func() *IgnoreCast { return new(IgnoreCast) },
				Capture: func(c *IgnoreCast, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[CharacterBase](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *IgnoreCast, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeIgnoreCastState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[CharacterBase](ctx))
				}, Validate: func(c *IgnoreCast) error { return validateWrappedPeriod(c.CharacterBase) }})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[IgnoreFriendlyFire]{Type: IgnoreFriendlyFireStateType, Version: IgnoreFriendlyFireStateVersion, Init: func() *IgnoreFriendlyFire { return new(IgnoreFriendlyFire) },
				Capture: func(c *IgnoreFriendlyFire, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[CharacterBase](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *IgnoreFriendlyFire, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeIgnoreFriendlyFireState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[CharacterBase](ctx))
				}, Validate: func(c *IgnoreFriendlyFire) error { return validateWrappedPeriod(c.CharacterBase) }})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[phaseProviderCharacter]{Type: PhaseProviderCharacterStateType, Version: PhaseProviderCharacterStateVersion, Init: func() *phaseProviderCharacter { return new(phaseProviderCharacter) },
				Capture: func(c *phaseProviderCharacter, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[Character](ctx), ownergraph.Reference[phases.PhaseProvider](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *phaseProviderCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodePhaseProviderCharacterState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[Character](ctx), ownergraph.Loader[phases.PhaseProvider](ctx))
				}, Validate: func(c *phaseProviderCharacter) error { return validateWrappedPeriod(c.Character) }})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[scriptedDefeatCharacter]{Type: ScriptedDefeatCharacterStateType, Version: ScriptedDefeatCharacterStateVersion, Init: func() *scriptedDefeatCharacter { return new(scriptedDefeatCharacter) },
				Capture: func(c *scriptedDefeatCharacter, ctx *ownergraph.Capture) ([]byte, error) {
					if e := c.validateGraphOwner(); e != nil {
						return nil, e
					}
					s, e := c.CaptureState(ownergraph.Reference[Character](ctx), ownergraph.Reference[*ScriptedDefeatDetector](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *scriptedDefeatCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeScriptedDefeatCharacterState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[Character](ctx), ownergraph.Loader[*ScriptedDefeatDetector](ctx))
				}, Validate: func(c *scriptedDefeatCharacter) error { return c.validateGraphOwner() }})
		},
	}
	for _, register := range registrations {
		if e := register(); e != nil {
			return e
		}
	}
	return nil
}

// RegisterBaseGraphOwner explicitly registers a custom-period Base specialization.
func RegisterBaseGraphOwner[M period.IsPeriod](r *ownergraph.Registry, tag string) error {
	return ownergraph.Register(r, ownergraph.Codec[Base[M]]{Type: tag, Version: BaseStateVersion, Init: func() *Base[M] { return new(Base[M]) }, Capture: func(c *Base[M], ctx *ownergraph.Capture) ([]byte, error) {
		s, e := c.CaptureState(ownergraph.Reference[M](ctx), ownergraph.Reference[messages.Message](ctx))
		if e != nil {
			return nil, e
		}
		ref, e := ctx.Ref(c.lookup)
		if e != nil {
			return nil, e
		}
		return graphPayload(s, map[string]string{"lookup": ref})
	}, Restore: func(c *Base[M], v uint32, b []byte, ctx *ownergraph.Restore) error {
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
		return c.RestoreState(s, lookup, ownergraph.Loader[M](ctx), ownergraph.Loader[messages.Message](ctx))
	}})
}
func wireWrappedPeriod(c any, h period.Hook) {
	c.(interface{ WireGraphPeriodHook(period.Hook) }).WireGraphPeriodHook(h)
}
func validateWrappedPeriod(c any) error {
	if _, ok := c.(interface{ WireGraphPeriodHook(period.Hook) }); !ok {
		return fmt.Errorf("unsupported wrapped period owner %T", c)
	}
	return nil
}
func (c *PermanentDeath) WireGraphPeriodHook(h period.Hook) { wireWrappedPeriod(c.CharacterBase, h) }
func (c *StartsNewFight) WireGraphPeriodHook(h period.Hook) { wireWrappedPeriod(c.CharacterBase, h) }
func (c *DeathOnCast) WireGraphPeriodHook(h period.Hook)    { wireWrappedPeriod(c.CharacterBase, h) }
func (c *IgnoreCast) WireGraphPeriodHook(h period.Hook)     { wireWrappedPeriod(c.CharacterBase, h) }
func (c *IgnoreFriendlyFire) WireGraphPeriodHook(h period.Hook) {
	wireWrappedPeriod(c.CharacterBase, h)
}
func (c *scriptedDefeatCharacter) WireGraphPeriodHook(h period.Hook) {
	c.defeat.WireParticipantRuntime()
	wireWrappedPeriod(c.Character, h)
}
func (c *phaseProviderCharacter) WireGraphPeriodHook(h period.Hook) {
	wireWrappedPeriod(c.Character, h)
}

// NeverActive is the sole production value-character. It has no mutable children
// or address identity. The distinct boxed codec preserves its dynamic value type.
type graphNeverActiveValue struct{ NeverActive }

func registerNeverActiveValueGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[graphNeverActiveValue]{Type: "characters.NeverActive.Value", Version: NeverActiveStateVersion, Init: func() *graphNeverActiveValue { return new(graphNeverActiveValue) }, Capture: func(c *graphNeverActiveValue, _ *ownergraph.Capture) ([]byte, error) {
		return c.CaptureState().Encode()
	}, Restore: func(c *graphNeverActiveValue, v uint32, b []byte, _ *ownergraph.Restore) error {
		s, e := DecodeNeverActiveState(v, b)
		if e != nil {
			return e
		}
		return c.RestoreState(s)
	}})
}
func graphCharacterReference(ctx *ownergraph.Capture) func(Character) (string, error) {
	values := map[NeverActive]*graphNeverActiveValue{}
	return func(c Character) (string, error) {
		if value, ok := c.(NeverActive); ok {
			box := values[value]
			if box == nil {
				box = &graphNeverActiveValue{value}
				values[value] = box
			}
			return ctx.Ref(box)
		}
		return ctx.Ref(c)
	}
}
func graphCharacterLoader(ctx *ownergraph.Restore) func(string) (Character, error) {
	return func(ref string) (Character, error) {
		v, e := ctx.Load(ref)
		if e != nil {
			return nil, e
		}
		if value, ok := v.(*graphNeverActiveValue); ok {
			return value.NeverActive, nil
		}
		c, ok := v.(Character)
		if !ok {
			return nil, fmt.Errorf("invalid character reference %T", v)
		}
		return c, nil
	}
}

// WithTimeoutAsDeathWhileEntryAlive is the declarative equivalent of
// WithTimeoutAsDeathIf(IfEntryAlive(entry)). Unlike an arbitrary closure, its
// provenance and dependency can be safely persisted.
func (c *Common) WithTimeoutAsDeathWhileEntryAlive(entry uint32) *Common {
	c.WithTimeoutAsDeathIf(IfEntryAlive(entry))
	c.timeoutRecipe = "entry-alive"
	c.timeoutEntry = entry
	return c
}
func (c *Common) ValidateTimeoutRecipe() error {
	switch c.timeoutRecipe {
	case "always":
		if c.timeoutEntry != 0 {
			return fmt.Errorf("unexpected timeout entry")
		}
	case "entry-alive":
		if c.timeoutEntry == 0 {
			return fmt.Errorf("missing timeout entry")
		}
	default:
		return fmt.Errorf("unknown timeout recipe %q", c.timeoutRecipe)
	}
	if c.Base == nil || c.Lookup() == nil {
		return fmt.Errorf("missing timeout lookup")
	}
	return nil
}
func (c *Common) TimeoutCountsAsDeath() bool {
	switch c.timeoutRecipe {
	case "always":
		return true
	case "entry-alive":
		return IfEntryAlive(c.timeoutEntry)(c.Lookup())
	default:
		return false
	}
}
func (c *Common) WireGraphPeriodHook(h period.Hook) {
	if c.timeoutRecipe != "" {
		c.timeoutAsDeathIf = func(*Characters) bool { return c.TimeoutCountsAsDeath() }
	}
	for _, p := range c.Activity.History {
		p.WireTimeoutRuntime()
	}
	c.Base.WireGraphPeriodHook(h)
}

// WithParticipantOwner replaces the participant predicate with the explicit
// canonical Characters relationship. It never evaluates the predicate.
func (d *ScriptedDefeatDetector) WithParticipantOwner(all *Characters) *ScriptedDefeatDetector {
	d.participantOwner = all
	d.config.AuraCleanup.NoKnownParticipantsAlive = nil
	if all != nil {
		d.config.AuraCleanup.NoKnownParticipantsAlive = all.NoKnownParticipantsAlive
	}
	return d
}
func (d *ScriptedDefeatDetector) WireParticipantRuntime() {
	if d.participantOwner != nil {
		d.config.AuraCleanup.NoKnownParticipantsAlive = d.participantOwner.NoKnownParticipantsAlive
	}
}
func NewScriptedDefeatCharacterWithParticipantOwner(id guid.GUID, c Character, config ScriptedDefeatConfig, all *Characters) Character {
	return &scriptedDefeatCharacter{Character: c, defeat: NewScriptedDefeatDetector(id, config).WithParticipantOwner(all)}
}
func registerScriptedDefeatGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[ScriptedDefeatDetector]{Type: ScriptedDefeatDetectorStateType, Version: ScriptedDefeatDetectorStateVersion, Init: func() *ScriptedDefeatDetector { return new(ScriptedDefeatDetector) }, Capture: func(c *ScriptedDefeatDetector, ctx *ownergraph.Capture) ([]byte, error) {
		s, e := c.CaptureState()
		if e != nil {
			return nil, e
		}
		refs := map[string]string{}
		if s.value.HasParticipantCallback {
			if c.participantOwner == nil {
				return nil, fmt.Errorf("scripted defeat participant callback requires trusted runtime adapter")
			}
			refs["participants"], e = ctx.Ref(c.participantOwner)
			if e != nil {
				return nil, e
			}
		}
		return graphPayload(s, refs)
	}, Restore: func(c *ScriptedDefeatDetector, v uint32, b []byte, ctx *ownergraph.Restore) error {
		g, e := graphDecode(b)
		if e != nil {
			return e
		}
		s, e := DecodeScriptedDefeatDetectorState(v, g.State)
		if e != nil {
			return e
		}
		ref := g.Refs["participants"]
		if len(g.Refs) > 1 || (len(g.Refs) == 1 && ref == "") || s.value.HasParticipantCallback != (ref != "") {
			return fmt.Errorf("participant owner mismatch")
		}
		var all *Characters
		if ref != "" {
			all, e = ownergraph.ResolveAs[*Characters](ctx, ref)
			if e != nil {
				return e
			}
		}
		s.value.HasParticipantCallback = false
		if e := c.RestoreState(s, nil); e != nil {
			return e
		}
		c.participantOwner = all
		return nil
	}})
}

func (c *scriptedDefeatCharacter) validateGraphOwner() error {
	if err := validateWrappedPeriod(c.Character); err != nil {
		return err
	}
	var all *Characters
	if lookup, ok := c.Character.(interface{ Lookup() *Characters }); ok {
		all = lookup.Lookup()
	}
	return c.defeat.ValidateGraphBinding(c.ID(), all)
}

// ValidateGraphBinding checks the detector's identity and canonical participant
// dependency without exposing state, evaluating callbacks, or attaching runtime.
func (d *ScriptedDefeatDetector) ValidateGraphBinding(id guid.GUID, all *Characters) error {
	if d == nil || d.id != id {
		return fmt.Errorf("scripted defeat character identity mismatch")
	}
	if d.participantOwner != nil && d.participantOwner != all {
		return fmt.Errorf("scripted defeat participant owner mismatch")
	}
	return nil
}
