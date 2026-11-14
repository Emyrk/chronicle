package synthetic

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
)

// CaptureValues returns owner payloads for the enclosing ONE graph. It neither
// constructs another registry nor duplicates shared Damage or spell objects.
// The enclosing source enforces a successful full-file boundary.
func (s *Synthetic) CaptureValues(damage func(guid.GUID, *messages.Damage) (string, error), spell func(*chrondbc.Spell) (string, error)) (map[stategraph.Path]stategraph.ValuePayload, error) {
	if s.graphPending || s.knownArmor == nil {
		return nil, fmt.Errorf("synthetic runtime is unwired")
	}
	if len(s.knownArmor.previous) != 0 {
		return nil, fmt.Errorf("unsupported populated legacy armor cache")
	}
	result := make(map[stategraph.Path]stategraph.ValuePayload)
	add := func(name, typ string, version uint32, encode func() ([]byte, error)) error {
		payload, err := encode()
		if err != nil {
			return err
		}
		result[stategraph.Path("/root/synthetics/"+name)] = stategraph.ValuePayload{Type: typ, Version: version, Payload: payload}
		return nil
	}
	slain, err := s.slain.CaptureState(damage)
	if err != nil {
		return nil, err
	}
	if err := add("slain", SlainStateType, SlainStateVersion, slain.Encode); err != nil {
		return nil, err
	}
	absorption, err := s.absorption.CaptureState(spell)
	if err != nil {
		return nil, err
	}
	if err := add("absorption", AbsorptionStateType, AbsorptionStateVersion, absorption.Encode); err != nil {
		return nil, err
	}
	raz := s.razuvious.CaptureState()
	if err := add("razuvious", next.RazuviousStateType, next.RazuviousStateVersion, raz.Encode); err != nil {
		return nil, err
	}
	plus := s.vanillaPlus.CaptureState()
	if err := add("vanillaplus", "synthetic.VanillaPlus", VanillaPlusStateVersion, plus.Encode); err != nil {
		return nil, err
	}
	if s.auraOwner != nil {
		aura := s.auraOwner.CaptureState()
		if err := add("aura-owner", next.AuraOwnershipStateType, next.AuraOwnershipStateVersion, aura.Encode); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// RestoreValues constructs all owners privately before returning a candidate.
// Format/flavor and runtime dependencies come from the compatibility-checked
// caller. Timings are diagnostic and restart; semantic state does not.
func RestoreValues(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, values map[stategraph.Path]stategraph.ValuePayload, damage func(string) (*messages.Damage, error), spell func(string) (*chrondbc.Spell, error)) (*Synthetic, error) {
	candidate, err := RestoreSemanticValues(values, damage, spell)
	if err != nil {
		return nil, err
	}
	if err := candidate.WireGraphRuntime(ctx, logger, db); err != nil {
		return nil, err
	}
	return candidate, nil
}

// RestoreSemanticValues loads only retained semantic owners and canonical refs.
// It never constructs runtime processors, queries dependencies or emits messages.
func RestoreSemanticValues(values map[stategraph.Path]stategraph.ValuePayload, damage func(string) (*messages.Damage, error), spell func(string) (*chrondbc.Spell, error)) (*Synthetic, error) {
	if len(values) != 4 && len(values) != 5 {
		return nil, fmt.Errorf("unexpected synthetic owner count")
	}
	get := func(name, typ string) (stategraph.ValuePayload, error) {
		p, ok := values[stategraph.Path("/root/synthetics/"+name)]
		if !ok || p.Type != typ {
			return p, fmt.Errorf("missing or incompatible synthetic owner %s", name)
		}
		return p, nil
	}
	p, err := get("slain", SlainStateType)
	if err != nil {
		return nil, err
	}
	slain, err := DecodeSlainState(p.Version, p.Payload)
	if err != nil {
		return nil, err
	}
	slainOwner, err := slain.Restore(damage)
	if err != nil {
		return nil, err
	}
	p, err = get("absorption", AbsorptionStateType)
	if err != nil {
		return nil, err
	}
	absorption, err := DecodeAbsorptionState(p.Version, p.Payload)
	if err != nil {
		return nil, err
	}
	absorptionOwner, err := absorption.Restore(nil, spell)
	if err != nil {
		return nil, err
	}
	p, err = get("razuvious", next.RazuviousStateType)
	if err != nil {
		return nil, err
	}
	raz, err := next.DecodeRazuviousState(p.Version, p.Payload)
	if err != nil {
		return nil, err
	}
	razOwner, err := raz.Restore()
	if err != nil {
		return nil, err
	}
	p, err = get("vanillaplus", "synthetic.VanillaPlus")
	if err != nil {
		return nil, err
	}
	plus, err := DecodeVanillaPlusState(p.Version, p.Payload)
	if err != nil {
		return nil, err
	}
	plusOwner, err := plus.Restore()
	if err != nil {
		return nil, err
	}
	var auraOwner *next.AuraOwnership
	if p, ok := values["/root/synthetics/aura-owner"]; ok {
		if p.Type != next.AuraOwnershipStateType {
			return nil, fmt.Errorf("incompatible aura owner")
		}
		aura, err := next.DecodeAuraOwnershipState(p.Version, p.Payload)
		if err != nil {
			return nil, err
		}
		auraOwner, err = aura.Restore()
		if err != nil {
			return nil, err
		}
	} else if len(values) != 4 {
		return nil, fmt.Errorf("unexpected synthetic owner")
	}
	candidate := &Synthetic{graphPending: true}
	candidate.slain = slainOwner
	candidate.absorption = absorptionOwner
	candidate.razuvious = razOwner
	candidate.vanillaPlus = plusOwner
	candidate.auraOwner = auraOwner
	return candidate, nil
}

// WireGraphRuntime installs stateless runtime processors after semantic load.
func (s *Synthetic) WireGraphRuntime(ctx context.Context, logger *slog.Logger, db gamedb.GameDB) error {
	if !s.graphPending || ctx == nil || db == nil {
		return fmt.Errorf("synthetic runtime not ready")
	}
	runtime := New(ctx, logger, db)
	s.logger, s.flavor, s.wowDB = runtime.logger, runtime.flavor, runtime.wowDB
	s.mitigation, s.extraAttack, s.demons, s.possession, s.knownObjects, s.knownArmor = runtime.mitigation, runtime.extraAttack, runtime.demons, runtime.possession, runtime.knownObjects, runtime.knownArmor
	s.absorption.logger = logger
	s.graphPending = false
	return nil
}
