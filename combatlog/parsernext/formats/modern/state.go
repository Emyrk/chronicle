package modern

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
)

const StateVersion uint32 = 1

// State is the owned modern GUID/name/layout and handler state. Dataset talent
// trees and spell lookups are trusted runtime dependencies, never archived.
type State struct {
	Format            database.LogFormat      `json:"format"`
	Flavor            database.WoWFlavor      `json:"flavor"`
	RawToValue        map[string]uint64       `json:"raw_to_value"`
	ValueToRaw        map[uint64]string       `json:"value_to_raw"`
	Names             map[string]string       `json:"names"`
	PreserveTimestamp bool                    `json:"preserve_timestamp"`
	TrimSuffix        bool                    `json:"trim_suffix"`
	CombatLogVersion  int                     `json:"combat_log_version"`
	AdvancedFields    int                     `json:"advanced_fields"`
	PreserveLayout    bool                    `json:"preserve_layout"`
	HandlerVersion    int                     `json:"handler_version"`
	Owners            map[guid.GUID]guid.GUID `json:"owners"`
	Core              cleu.State              `json:"core"`
}

func (s State) validate() error {
	if s.Format != database.LogFormatV9Cleu && s.Format != database.LogFormatV22Cleu && s.Format != database.LogFormatHermesproxy1142Cc {
		return fmt.Errorf("unsupported modern format")
	}
	if len(s.Flavor) == 0 || s.RawToValue == nil || s.ValueToRaw == nil || s.Names == nil {
		return fmt.Errorf("missing modern state")
	}
	if s.Core.Context.Format != s.Format || !slices.Equal(s.Core.Context.Flavor, s.Flavor) {
		return fmt.Errorf("modern core metadata mismatch")
	}
	if len(s.RawToValue) != len(s.ValueToRaw) {
		return fmt.Errorf("GUID inverse size mismatch")
	}
	for raw, value := range s.RawToValue {
		if s.ValueToRaw[value] != raw {
			return fmt.Errorf("GUID inverse mismatch")
		}
	}
	if s.CombatLogVersion != 0 && s.CombatLogVersion != 9 && s.CombatLogVersion != 22 {
		return fmt.Errorf("unsupported saved wire version")
	}
	if s.HandlerVersion != 9 && s.HandlerVersion != 22 {
		return fmt.Errorf("unsupported handler version")
	}
	hermes := s.Format == database.LogFormatHermesproxy1142Cc
	if s.PreserveTimestamp != hermes || s.PreserveLayout != hermes || !s.TrimSuffix {
		return fmt.Errorf("modern normalization options mismatch")
	}
	fields := v9AdvancedCombatFields
	if s.CombatLogVersion == 22 {
		fields = v22AdvancedCombatFields
	}
	if hermes {
		fields = 16
	}
	if s.AdvancedFields != fields {
		return fmt.Errorf("modern field layout mismatch")
	}
	_, e := s.Core.Restore()
	return e
}
func (d *Decoder) CaptureState() (State, error) {
	if d == nil || d.normalizer == nil || d.handlers == nil || d.core == nil {
		return State{}, fmt.Errorf("missing decoder")
	}
	n := d.normalizer
	t := n.transform
	if t == nil || t.guids == nil || d.handlers.GUIDs != t.guids || t.buf.Len() != 0 || t.err != nil {
		return State{}, fmt.Errorf("invalid modern normalizer ownership")
	}
	s := State{Format: n.format, Flavor: slices.Clone(n.flavor), RawToValue: maps.Clone(t.guids.rawToValue), ValueToRaw: maps.Clone(t.guids.valueToRaw), Names: maps.Clone(t.names), PreserveTimestamp: t.preserveTimestamp, TrimSuffix: t.trimPlayerNameSuffix, CombatLogVersion: t.CombatLogVersion, AdvancedFields: t.advancedCombatFields, PreserveLayout: t.preserveAdvancedFieldLayout, HandlerVersion: d.handlers.Version, Owners: maps.Clone(d.handlers.Owners), Core: d.core.CaptureState()}
	return s, s.validate()
}
func (s State) Encode() ([]byte, error) {
	if e := s.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s)
}
func DecodeState(version uint32, b []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported modern state version")
	}
	var s State
	if e := cleu.DecodeStateValue(b, &s); e != nil {
		return State{}, e
	}
	return s, s.validate()
}
func (s State) Restore() (*Decoder, error) {
	if e := s.validate(); e != nil {
		return nil, e
	}
	core, e := s.Core.Restore()
	if e != nil {
		return nil, e
	}
	guids := &GUIDNormalizer{rawToValue: maps.Clone(s.RawToValue), valueToRaw: maps.Clone(s.ValueToRaw)}
	return &Decoder{normalizer: &Normalizer{format: s.Format, flavor: slices.Clone(s.Flavor), transform: &TransformReader{guids: guids, names: maps.Clone(s.Names), preserveTimestamp: s.PreserveTimestamp, trimPlayerNameSuffix: s.TrimSuffix, CombatLogVersion: s.CombatLogVersion, advancedCombatFields: s.AdvancedFields, preserveAdvancedFieldLayout: s.PreserveLayout}}, handlers: &HandlerState{Version: s.HandlerVersion, Flavor: slices.Clone(s.Flavor), GUIDs: guids, Owners: maps.Clone(s.Owners)}, core: core}, nil
}
func (d *Decoder) ValidateGraphRuntime(ctx context.Context) error {
	meta, ok := parsectx.FromContext(ctx)
	if !ok || meta.Format != d.normalizer.format || !slices.Equal(meta.Flavor, d.normalizer.flavor) {
		return fmt.Errorf("modern runtime metadata mismatch")
	}
	return nil
}

// WireGraphRuntime binds fresh trusted handlers only after semantic load.
func (d *Decoder) WireGraphRuntime(ctx context.Context, options DecoderOptions) error {
	if e := d.ValidateGraphRuntime(ctx); e != nil {
		return e
	}
	fresh, e := NewDecoder(ctx, options)
	if e != nil {
		return e
	}
	_, trees := parsectx.DatasetTalents(ctx)
	d.handlers.Spells = options.Spells
	d.handlers.TalentTrees = trees
	fresh.normalizer = d.normalizer
	fresh.handlers = d.handlers
	*d = *fresh
	return nil
}
