package synthetic

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"
	"slices"
	"sort"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic/zonedetector"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
)

const StateVersion uint32 = 1
const StateType = "wotlk.synthetic.Synthetic"

type State struct{ value syntheticValue }
type ownerValue struct {
	Owner    guid.GUID     `json:"owner"`
	Strength ownerStrength `json:"strength"`
}
type knownOwnerValue struct {
	Name   string                 `json:"name"`
	Entry  uint32                 `json:"entry"`
	Owners map[guid.GUID]struct{} `json:"owners"`
}
type earthValue struct {
	Caster  guid.GUID        `json:"caster"`
	SpellID chrondbc.SpellID `json:"spell_id"`
}
type bloomValue struct {
	Caster guid.GUID `json:"caster"`
	CastAt time.Time `json:"cast_at"`
}
type feignValue struct {
	LastDamage map[guid.GUID]string `json:"last_damage"`
	Spell      string               `json:"spell"`
}
type syntheticValue struct {
	Options    Options                         `json:"options"`
	LastEmit   map[guid.GUID]time.Time         `json:"last_emit"`
	Classes    map[guid.GUID]types.HeroClasses `json:"classes"`
	Combatants map[guid.GUID]struct{}          `json:"combatants"`
	Emitted    map[guid.GUID]ownerValue        `json:"emitted"`
	Known      []knownOwnerValue               `json:"known"`
	Zone       *zonedetector.State             `json:"zone"`
	Feign      *feignValue                     `json:"feign"`
	Slain      stategraph.ValuePayload         `json:"slain"`
	Absorption *stategraph.ValuePayload        `json:"absorption"`
	Earth      map[guid.GUID]earthValue        `json:"earth"`
	Bloom      map[guid.GUID][]bloomValue      `json:"bloom"`
}

func (s *Synthetic) CaptureState(damage func(*messages.Damage) (string, error), spell func(*chrondbc.Spell) (string, error)) (State, error) {
	if s == nil || s.graphPending || s.unitInfo == nil || s.petOwnership == nil || s.slain == nil || s.possession == nil {
		return State{}, fmt.Errorf("synthetic runtime not initialized")
	}
	v := syntheticValue{Options: s.options, LastEmit: maps.Clone(s.unitInfo.lastEmit), Classes: maps.Clone(s.unitInfo.detectedClass), Combatants: maps.Clone(s.unitInfo.knownCombatants), Emitted: map[guid.GUID]ownerValue{}, Known: []knownOwnerValue{}}
	for id, o := range s.petOwnership.emitted {
		v.Emitted[id] = ownerValue{o.owner, o.strength}
	}
	for key, owners := range s.petOwnership.knownOwners {
		v.Known = append(v.Known, knownOwnerValue{key.name, key.entry, maps.Clone(owners)})
	}
	sort.Slice(v.Known, func(i, j int) bool {
		if v.Known[i].Name == v.Known[j].Name {
			return v.Known[i].Entry < v.Known[j].Entry
		}
		return v.Known[i].Name < v.Known[j].Name
	})
	if s.zoneDetector != nil {
		z := s.zoneDetector.CaptureState()
		v.Zone = &z
	}
	if s.feignDeath != nil {
		if s.feignDeath.classOwner != s.unitInfo {
			return State{}, fmt.Errorf("unrecognized feign class callback owner")
		}
		v.Feign = &feignValue{LastDamage: map[guid.GUID]string{}}
		for _, id := range slices.Sorted(maps.Keys(s.feignDeath.lastDamage)) {
			d := s.feignDeath.lastDamage[id]
			if d == nil || damage == nil {
				return State{}, fmt.Errorf("missing feign damage")
			}
			r, e := damage(d)
			if e != nil {
				return State{}, e
			}
			v.Feign.LastDamage[id] = r
		}
		if s.feignDeath.spell != nil {
			if spell == nil {
				return State{}, fmt.Errorf("missing spell resolver")
			}
			r, e := spell(s.feignDeath.spell)
			if e != nil {
				return State{}, e
			}
			v.Feign.Spell = r
		}
	}
	slain, e := s.slain.CaptureState(func(_ guid.GUID, d *messages.Damage) (string, error) {
		if damage == nil {
			return "", fmt.Errorf("missing damage resolver")
		}
		return damage(d)
	})
	if e != nil {
		return State{}, e
	}
	b, e := slain.Encode()
	if e != nil {
		return State{}, e
	}
	v.Slain = stategraph.ValuePayload{Type: vanilla.SlainStateType, Version: vanilla.SlainStateVersion, Payload: b}
	if s.absorption != nil {
		a, e := s.absorption.CaptureState(spell)
		if e != nil {
			return State{}, e
		}
		b, e := a.Encode()
		if e != nil {
			return State{}, e
		}
		v.Absorption = &stategraph.ValuePayload{Type: vanilla.AbsorptionStateType, Version: vanilla.AbsorptionStateVersion, Payload: b}
	}
	if s.earthShield != nil {
		v.Earth = map[guid.GUID]earthValue{}
		for id, o := range s.earthShield.owners {
			v.Earth[id] = earthValue{o.caster, o.spellID}
		}
	}
	if s.lifebloom != nil {
		v.Bloom = map[guid.GUID][]bloomValue{}
		for id, pending := range s.lifebloom.pendingByTarget {
			var entries []bloomValue
			if pending != nil {
				entries = []bloomValue{}
			}
			for _, p := range pending {
				entries = append(entries, bloomValue{p.caster, p.castAt})
			}
			v.Bloom[id] = entries
		}
	}
	state := State{v}
	if e := state.validate(); e != nil {
		return State{}, e
	}
	return state, nil
}
func (s State) Encode() ([]byte, error) {
	if e := s.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported Wrath synthetic version")
	}
	var v syntheticValue
	if e := decodeSyntheticValue(payload, &v); e != nil {
		return State{}, e
	}
	s := State{v}
	return s, s.validate()
}
func (s State) validate() error {
	v := s.value
	if v.LastEmit == nil || v.Classes == nil || v.Combatants == nil || v.Emitted == nil || v.Known == nil {
		return fmt.Errorf("missing synthetic maps")
	}
	for _, owner := range v.Emitted {
		if owner.Strength != strengthWeak && owner.Strength != strengthStrong {
			return fmt.Errorf("invalid owner strength")
		}
	}
	seen := map[petKey]bool{}
	for _, k := range v.Known {
		key := petKey{k.Name, k.Entry}
		if seen[key] || k.Owners == nil {
			return fmt.Errorf("invalid known owner set")
		}
		seen[key] = true
	}
	if v.Feign != nil {
		if v.Feign.LastDamage == nil {
			return fmt.Errorf("missing feign map")
		}
		for _, ref := range v.Feign.LastDamage {
			if ref == "" {
				return fmt.Errorf("empty damage reference")
			}
		}
	}
	if v.Slain.Type != vanilla.SlainStateType {
		return fmt.Errorf("invalid slain owner")
	}
	if _, e := vanilla.DecodeSlainState(v.Slain.Version, v.Slain.Payload); e != nil {
		return e
	}
	if v.Absorption != nil {
		if v.Absorption.Type != vanilla.AbsorptionStateType {
			return fmt.Errorf("invalid absorption owner")
		}
		if _, e := vanilla.DecodeAbsorptionState(v.Absorption.Version, v.Absorption.Payload); e != nil {
			return e
		}
	}
	if v.Zone != nil && v.Zone.Entries == nil {
		return fmt.Errorf("missing zone entries")
	}
	return nil
}
func (s State) Restore(damage func(string) (*messages.Damage, error), spell func(string) (*chrondbc.Spell, error)) (*Synthetic, error) {
	if e := s.validate(); e != nil {
		return nil, e
	}
	v := s.value
	c := &Synthetic{options: v.Options, graphPending: true, unitInfo: &unitInfo{lastEmit: maps.Clone(v.LastEmit), detectedClass: maps.Clone(v.Classes), knownCombatants: maps.Clone(v.Combatants)}, petOwnership: &petOwnership{emitted: map[guid.GUID]emittedOwner{}, knownOwners: map[petKey]map[guid.GUID]struct{}{}}}
	for id, o := range v.Emitted {
		c.petOwnership.emitted[id] = emittedOwner{o.Owner, o.Strength}
	}
	for _, k := range v.Known {
		c.petOwnership.knownOwners[petKey{k.Name, k.Entry}] = maps.Clone(k.Owners)
	}
	if v.Zone != nil {
		z, e := v.Zone.Restore()
		if e != nil {
			return nil, e
		}
		c.zoneDetector = z
	}
	if v.Feign != nil {
		c.feignDeath = &feignDeath{classOwner: c.unitInfo, lastDamage: map[guid.GUID]*messages.Damage{}}
		for _, id := range slices.Sorted(maps.Keys(v.Feign.LastDamage)) {
			if damage == nil {
				return nil, fmt.Errorf("missing damage loader")
			}
			d, e := damage(v.Feign.LastDamage[id])
			if e != nil {
				return nil, e
			}
			if d == nil || d.Target != id {
				return nil, fmt.Errorf("feign damage target mismatch")
			}
			c.feignDeath.lastDamage[id] = d
		}
		if v.Feign.Spell != "" {
			if spell == nil {
				return nil, fmt.Errorf("missing spell loader")
			}
			sp, e := spell(v.Feign.Spell)
			if e != nil {
				return nil, e
			}
			if sp == nil || sp.ID != feignDeathSpellID {
				return nil, fmt.Errorf("feign spell mismatch")
			}
			c.feignDeath.spell = sp
		}
	}
	slain, e := vanilla.DecodeSlainState(v.Slain.Version, v.Slain.Payload)
	if e != nil {
		return nil, e
	}
	c.slain, e = slain.Restore(damage)
	if e != nil {
		return nil, e
	}
	if v.Absorption != nil {
		a, e := vanilla.DecodeAbsorptionState(v.Absorption.Version, v.Absorption.Payload)
		if e != nil {
			return nil, e
		}
		c.absorption, e = a.Restore(nil, spell)
		if e != nil {
			return nil, e
		}
	}
	if v.Earth != nil {
		c.earthShield = &earthShieldAttribution{owners: map[guid.GUID]earthShieldOwner{}}
		for id, o := range v.Earth {
			c.earthShield.owners[id] = earthShieldOwner{o.Caster, o.SpellID}
		}
	}
	if v.Bloom != nil {
		c.lifebloom = &lifebloomAttribution{pendingByTarget: map[guid.GUID][]pendingLifebloom{}}
		for id, entries := range v.Bloom {
			var pending []pendingLifebloom
			if entries != nil {
				pending = []pendingLifebloom{}
			}
			for _, p := range entries {
				pending = append(pending, pendingLifebloom{p.Caster, p.CastAt})
			}
			c.lifebloom.pendingByTarget[id] = pending
		}
	}
	return c, nil
}
func defaultGraphOptions(format database.LogFormat) Options {
	return Options{CreditEarthShield: format == database.LogFormat243CcAddon, CreditLifebloom: format == database.LogFormat243CcAddon, GenerateAbsorbs: true, DetectZone: true}
}
func (s *Synthetic) ValidateGraphRuntime(ctx context.Context, db gamedb.GameDB, reg *registry.Registry, names NameResolver) error {
	if ctx == nil {
		return fmt.Errorf("missing synthetic context")
	}
	format, _ := parsectx.Format(ctx)
	if format != database.LogFormat243CcAddon && format != database.LogFormat335aCcAddon {
		return fmt.Errorf("invalid synthetic format")
	}
	return s.ValidateGraphRuntimeWithOptions(ctx, db, reg, names, defaultGraphOptions(format))
}
func (s *Synthetic) ValidateGraphRuntimeWithOptions(ctx context.Context, db gamedb.GameDB, reg *registry.Registry, names NameResolver, options Options) error {
	if s == nil || !s.graphPending || ctx == nil {
		return fmt.Errorf("synthetic runtime not pending")
	}
	format, ok := parsectx.Format(ctx)
	if !ok {
		return fmt.Errorf("missing synthetic format")
	}
	if err := (State{value: syntheticValue{Options: s.options}}).validateTrustedOptions(format, options); err != nil {
		return err
	}
	if (s.feignDeath != nil) != (format == database.LogFormat335aCcAddon) || (s.earthShield != nil) != options.CreditEarthShield || (s.lifebloom != nil) != options.CreditLifebloom || (s.absorption != nil) != options.GenerateAbsorbs || (s.zoneDetector != nil) != (options.DetectZone && reg != nil) {
		return fmt.Errorf("synthetic recipe mismatch")
	}
	if db == nil || names == nil {
		return fmt.Errorf("synthetic runtime dependencies missing")
	}
	if s.zoneDetector != nil {
		return s.zoneDetector.ValidateGraphRuntime(reg)
	}
	return nil
}
func (s *Synthetic) WireGraphRuntime(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, reg *registry.Registry, names NameResolver) error {
	if err := s.ValidateGraphRuntime(ctx, db, reg, names); err != nil {
		return err
	}
	format, _ := parsectx.Format(ctx)
	return s.WireGraphRuntimeWithOptions(ctx, logger, db, reg, names, defaultGraphOptions(format))
}

// WireGraphRuntimeWithOptions binds a caller-owned recipe, never archive-selected options.
func (s *Synthetic) WireGraphRuntimeWithOptions(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, reg *registry.Registry, names NameResolver, options Options) error {
	if err := s.ValidateGraphRuntimeWithOptions(ctx, db, reg, names, options); err != nil {
		return err
	}

	s.logger = logger
	s.wowDB = db
	s.unitInfo.ctx = ctx
	s.unitInfo.logger = logger
	s.unitInfo.creatures = db
	s.unitInfo.names = names
	s.unitInfo.spells = db
	s.petOwnership.logger = logger
	s.petOwnership.names = names
	if s.zoneDetector != nil {
		s.zoneDetector.WireGraphRuntime(logger)
	}
	if s.feignDeath != nil {
		s.feignDeath.ctx = ctx
		s.feignDeath.spells = db
		s.feignDeath.classForPlayer = s.unitInfo.classForPlayer
	}
	s.possession = vanilla.NewPossession(ctx, logger)
	if s.absorption != nil {
		s.absorption.WireGraphRuntime(logger)
	}
	s.graphPending = false
	return nil
}

// ValidateFormat rejects changes to the fixed production pipeline composition
// before any retained references are resolved.
func (s State) ValidateFormat(format database.LogFormat) error {
	if format != database.LogFormat243CcAddon && format != database.LogFormat335aCcAddon {
		return fmt.Errorf("unsupported synthetic format")
	}
	return s.ValidateOptions(format, defaultGraphOptions(format))
}
func (s State) validateTrustedOptions(format database.LogFormat, options Options) error {
	switch format {
	case database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
	default:
		return fmt.Errorf("unsupported synthetic format")
	}
	if s.value.Options != options {
		return fmt.Errorf("synthetic options mismatch")
	}
	return nil
}

// ValidateOptions checks the trusted production recipe before resolving graph references.
func (s State) ValidateOptions(format database.LogFormat, options Options) error {
	if err := s.validateTrustedOptions(format, options); err != nil {
		return err
	}
	v := s.value
	if (v.Feign != nil) != (format == database.LogFormat335aCcAddon) || (v.Earth != nil) != options.CreditEarthShield || (v.Bloom != nil) != options.CreditLifebloom || (v.Absorption != nil) != options.GenerateAbsorbs || (v.Zone != nil && !options.DetectZone) {
		return fmt.Errorf("synthetic composition mismatch")
	}
	return nil
}
