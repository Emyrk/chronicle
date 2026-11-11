package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"maps"
	"reflect"
	"slices"
)

// Wrapper codecs own only their local state and a canonical wrapped-character
// reference. They never restore the referenced owner or invoke its methods.
func captureWrapped(c CharacterBase, capture func(CharacterBase) (string, error)) (string, error) {
	if nilWrapped(c) || capture == nil {
		return "", fmt.Errorf("missing wrapped character/capture")
	}
	ref, err := capture(c)
	if err != nil {
		return "", err
	}
	if ref == "" {
		return "", fmt.Errorf("empty wrapped character reference")
	}
	return ref, nil
}
func resolveWrapped(ref string, resolve func(string) (CharacterBase, error)) (CharacterBase, error) {
	if ref == "" || resolve == nil {
		return nil, fmt.Errorf("missing wrapped character resolver")
	}
	c, err := resolve(ref)
	if err != nil {
		return nil, err
	}
	if nilWrapped(c) {
		return nil, fmt.Errorf("nil wrapped character")
	}
	return c, nil
}

// Typed-nil guard only, never reflection-based serialization or type discovery.
func nilWrapped(c CharacterBase) bool {
	v := reflect.ValueOf(c)
	if !v.IsValid() {
		return true
	}
	return v.Kind() == reflect.Pointer && v.IsNil()
}

const PermanentDeathStateType = "characters.PermanentDeath"
const PermanentDeathStateVersion uint32 = 1

type PermanentDeathState struct{ value permanentDeathValue }
type permanentDeathValue struct {
	Wrapped string `json:"wrapped"`
	Dead    bool   `json:"dead"`
}

func (c *PermanentDeath) CaptureState(capture func(CharacterBase) (string, error)) (PermanentDeathState, error) {
	if c == nil {
		return PermanentDeathState{}, fmt.Errorf("nil PermanentDeath")
	}
	ref, err := captureWrapped(c.CharacterBase, capture)
	if err != nil {
		return PermanentDeathState{}, err
	}
	return PermanentDeathState{permanentDeathValue{Wrapped: ref, Dead: c.dead}}, nil
}
func (s PermanentDeathState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodePermanentDeathState(version uint32, payload []byte) (PermanentDeathState, error) {
	if version != PermanentDeathStateVersion {
		return PermanentDeathState{}, fmt.Errorf("unsupported PermanentDeath version")
	}
	var v permanentDeathValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return PermanentDeathState{}, err
	}
	if v.Wrapped == "" {
		return PermanentDeathState{}, fmt.Errorf("empty wrapped character reference")
	}
	return PermanentDeathState{v}, nil
}
func (c *PermanentDeath) RestoreState(s PermanentDeathState, resolve func(string) (CharacterBase, error)) error {
	if c == nil {
		return fmt.Errorf("nil PermanentDeath destination")
	}
	wrapped, err := resolveWrapped(s.value.Wrapped, resolve)
	if err != nil {
		return err
	}
	*c = PermanentDeath{CharacterBase: wrapped, dead: s.value.Dead}
	return nil
}

const StartsNewFightStateType = "characters.StartsNewFight"
const StartsNewFightStateVersion uint32 = 1

type StartsNewFightState struct{ value startsNewFightValue }
type startsNewFightValue struct {
	Wrapped string `json:"wrapped"`
}

func (c *StartsNewFight) CaptureState(capture func(CharacterBase) (string, error)) (StartsNewFightState, error) {
	if c == nil {
		return StartsNewFightState{}, fmt.Errorf("nil StartsNewFight")
	}
	ref, err := captureWrapped(c.CharacterBase, capture)
	if err != nil {
		return StartsNewFightState{}, err
	}
	return StartsNewFightState{startsNewFightValue{Wrapped: ref}}, nil
}
func (s StartsNewFightState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeStartsNewFightState(version uint32, payload []byte) (StartsNewFightState, error) {
	if version != StartsNewFightStateVersion {
		return StartsNewFightState{}, fmt.Errorf("unsupported StartsNewFight version")
	}
	var v startsNewFightValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return StartsNewFightState{}, err
	}
	if v.Wrapped == "" {
		return StartsNewFightState{}, fmt.Errorf("empty wrapped character reference")
	}
	return StartsNewFightState{v}, nil
}
func (c *StartsNewFight) RestoreState(s StartsNewFightState, resolve func(string) (CharacterBase, error)) error {
	if c == nil {
		return fmt.Errorf("nil StartsNewFight destination")
	}
	wrapped, err := resolveWrapped(s.value.Wrapped, resolve)
	if err != nil {
		return err
	}
	*c = StartsNewFight{CharacterBase: wrapped}
	return nil
}

const DeathOnCastStateType = "characters.DeathOnCast"
const DeathOnCastStateVersion uint32 = 1

type DeathOnCastState struct{ value deathOnCastValue }
type deathOnCastValue struct {
	Wrapped string           `json:"wrapped"`
	SpellID chrondbc.SpellID `json:"spell_i_d"`
}

func (c *DeathOnCast) CaptureState(capture func(CharacterBase) (string, error)) (DeathOnCastState, error) {
	if c == nil {
		return DeathOnCastState{}, fmt.Errorf("nil DeathOnCast")
	}
	ref, err := captureWrapped(c.CharacterBase, capture)
	if err != nil {
		return DeathOnCastState{}, err
	}
	return DeathOnCastState{deathOnCastValue{Wrapped: ref, SpellID: c.spellID}}, nil
}
func (s DeathOnCastState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeDeathOnCastState(version uint32, payload []byte) (DeathOnCastState, error) {
	if version != DeathOnCastStateVersion {
		return DeathOnCastState{}, fmt.Errorf("unsupported DeathOnCast version")
	}
	var v deathOnCastValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return DeathOnCastState{}, err
	}
	if v.Wrapped == "" {
		return DeathOnCastState{}, fmt.Errorf("empty wrapped character reference")
	}
	return DeathOnCastState{v}, nil
}
func (c *DeathOnCast) RestoreState(s DeathOnCastState, resolve func(string) (CharacterBase, error)) error {
	if c == nil {
		return fmt.Errorf("nil DeathOnCast destination")
	}
	wrapped, err := resolveWrapped(s.value.Wrapped, resolve)
	if err != nil {
		return err
	}
	*c = DeathOnCast{CharacterBase: wrapped, spellID: s.value.SpellID}
	return nil
}

const IgnoreCastStateType = "characters.IgnoreCast"
const IgnoreCastStateVersion uint32 = 1

type IgnoreCastState struct{ value ignoreCastValue }
type ignoreCastValue struct {
	Wrapped      string                        `json:"wrapped"`
	IgnoreTarget bool                          `json:"ignore_target"`
	IgnoreSource bool                          `json:"ignore_source"`
	IgnoreSpells map[chrondbc.SpellID]struct{} `json:"ignore_spells"`
}

func (c *IgnoreCast) CaptureState(capture func(CharacterBase) (string, error)) (IgnoreCastState, error) {
	if c == nil {
		return IgnoreCastState{}, fmt.Errorf("nil IgnoreCast")
	}
	ref, err := captureWrapped(c.CharacterBase, capture)
	if err != nil {
		return IgnoreCastState{}, err
	}
	return IgnoreCastState{ignoreCastValue{Wrapped: ref, IgnoreTarget: c.ignoreTarget, IgnoreSource: c.ignoreSource, IgnoreSpells: maps.Clone(c.ignoreSpells)}}, nil
}
func (s IgnoreCastState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeIgnoreCastState(version uint32, payload []byte) (IgnoreCastState, error) {
	if version != IgnoreCastStateVersion {
		return IgnoreCastState{}, fmt.Errorf("unsupported IgnoreCast version")
	}
	var v ignoreCastValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return IgnoreCastState{}, err
	}
	if v.Wrapped == "" {
		return IgnoreCastState{}, fmt.Errorf("empty wrapped character reference")
	}
	return IgnoreCastState{v}, nil
}
func (c *IgnoreCast) RestoreState(s IgnoreCastState, resolve func(string) (CharacterBase, error)) error {
	if c == nil {
		return fmt.Errorf("nil IgnoreCast destination")
	}
	wrapped, err := resolveWrapped(s.value.Wrapped, resolve)
	if err != nil {
		return err
	}
	*c = IgnoreCast{CharacterBase: wrapped, ignoreTarget: s.value.IgnoreTarget, ignoreSource: s.value.IgnoreSource, ignoreSpells: maps.Clone(s.value.IgnoreSpells)}
	return nil
}

const IgnoreFriendlyFireStateType = "characters.IgnoreFriendlyFire"
const IgnoreFriendlyFireStateVersion uint32 = 1

type IgnoreFriendlyFireState struct{ value ignoreFriendlyFireValue }
type ignoreFriendlyFireValue struct {
	Wrapped string              `json:"wrapped"`
	Friends map[uint32]struct{} `json:"friends"`
}

func (c *IgnoreFriendlyFire) CaptureState(capture func(CharacterBase) (string, error)) (IgnoreFriendlyFireState, error) {
	if c == nil {
		return IgnoreFriendlyFireState{}, fmt.Errorf("nil IgnoreFriendlyFire")
	}
	ref, err := captureWrapped(c.CharacterBase, capture)
	if err != nil {
		return IgnoreFriendlyFireState{}, err
	}
	return IgnoreFriendlyFireState{ignoreFriendlyFireValue{Wrapped: ref, Friends: maps.Clone(c.friends)}}, nil
}
func (s IgnoreFriendlyFireState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeIgnoreFriendlyFireState(version uint32, payload []byte) (IgnoreFriendlyFireState, error) {
	if version != IgnoreFriendlyFireStateVersion {
		return IgnoreFriendlyFireState{}, fmt.Errorf("unsupported IgnoreFriendlyFire version")
	}
	var v ignoreFriendlyFireValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return IgnoreFriendlyFireState{}, err
	}
	if v.Wrapped == "" {
		return IgnoreFriendlyFireState{}, fmt.Errorf("empty wrapped character reference")
	}
	return IgnoreFriendlyFireState{v}, nil
}
func (c *IgnoreFriendlyFire) RestoreState(s IgnoreFriendlyFireState, resolve func(string) (CharacterBase, error)) error {
	if c == nil {
		return fmt.Errorf("nil IgnoreFriendlyFire destination")
	}
	wrapped, err := resolveWrapped(s.value.Wrapped, resolve)
	if err != nil {
		return err
	}
	*c = IgnoreFriendlyFire{CharacterBase: wrapped, friends: maps.Clone(s.value.Friends)}
	return nil
}

const AdsGoWithBossStateType = "characters.AdsGoWithBoss"
const AdsGoWithBossStateVersion uint32 = 1

type AdsGoWithBossState struct{ value adsGoWithBossValue }
type adsGoWithBossValue struct {
	Wrapped   string   `json:"wrapped"`
	BossEntry uint32   `json:"boss_entry"`
	Adds      []uint32 `json:"adds"`
}

func (c *AdsGoWithBoss) CaptureState(capture func(CharacterBase) (string, error)) (AdsGoWithBossState, error) {
	if c == nil {
		return AdsGoWithBossState{}, fmt.Errorf("nil AdsGoWithBoss")
	}
	ref, err := captureWrapped(c.CharacterBase, capture)
	if err != nil {
		return AdsGoWithBossState{}, err
	}
	return AdsGoWithBossState{adsGoWithBossValue{Wrapped: ref, BossEntry: c.bossEntry, Adds: slices.Clone(c.adds)}}, nil
}
func (s AdsGoWithBossState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeAdsGoWithBossState(version uint32, payload []byte) (AdsGoWithBossState, error) {
	if version != AdsGoWithBossStateVersion {
		return AdsGoWithBossState{}, fmt.Errorf("unsupported AdsGoWithBoss version")
	}
	var v adsGoWithBossValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return AdsGoWithBossState{}, err
	}
	if v.Wrapped == "" {
		return AdsGoWithBossState{}, fmt.Errorf("empty wrapped character reference")
	}
	return AdsGoWithBossState{v}, nil
}
func (c *AdsGoWithBoss) RestoreState(s AdsGoWithBossState, resolve func(string) (CharacterBase, error), lookup *Characters) error {
	if c == nil {
		return fmt.Errorf("nil AdsGoWithBoss destination")
	}
	if lookup == nil {
		return fmt.Errorf("missing canonical lookup")
	}
	wrapped, err := resolveWrapped(s.value.Wrapped, resolve)
	if err != nil {
		return err
	}
	*c = AdsGoWithBoss{CharacterBase: wrapped, bossEntry: s.value.BossEntry, adds: slices.Clone(s.value.Adds), all: lookup}
	return nil
}
