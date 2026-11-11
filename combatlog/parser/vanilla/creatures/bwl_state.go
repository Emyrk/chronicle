package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const NefarianStateType = "vanilla.Nefarian"
const NefarianStateVersion uint32 = 1

type NefarianState struct{ value nefarianValue }
type nefarianValue struct {
	Reference string `json:"reference"`
	P2Emitted bool   `json:"p2_emitted"`
}

func InitNefarian() *nefarian { return new(nefarian) }
func (c *nefarian) CaptureState(capture func(*characters.RoomMechanic) (string, error)) (NefarianState, error) {
	if c == nil || c.RoomMechanic == nil || c.all == nil || capture == nil {
		return NefarianState{}, fmt.Errorf("missing Nefarian dependencies")
	}
	ref, e := capture(c.RoomMechanic)
	if e != nil {
		return NefarianState{}, e
	}
	if ref == "" {
		return NefarianState{}, fmt.Errorf("empty Nefarian reference")
	}
	return NefarianState{nefarianValue{Reference: ref, P2Emitted: c.p2Emitted}}, nil
}
func (s NefarianState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeNefarianState(version uint32, payload []byte) (NefarianState, error) {
	if version != NefarianStateVersion {
		return NefarianState{}, fmt.Errorf("unsupported Nefarian version")
	}
	var v nefarianValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return NefarianState{}, e
	}
	if v.Reference == "" {
		return NefarianState{}, fmt.Errorf("empty Nefarian reference")
	}
	return NefarianState{v}, nil
}
func (c *nefarian) RestoreState(s NefarianState, all *characters.Characters, resolve func(string) (*characters.RoomMechanic, error)) error {
	if c == nil || all == nil || resolve == nil || s.value.Reference == "" {
		return fmt.Errorf("missing Nefarian destination/dependencies")
	}
	base, e := resolve(s.value.Reference)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil Nefarian dependency")
	}
	*c = nefarian{RoomMechanic: base, all: all, p2Emitted: s.value.P2Emitted}
	return nil
}

const BroodlordLashlayerStateType = "vanilla.BroodlordLashlayer"
const BroodlordLashlayerStateVersion uint32 = 1

type BroodlordLashlayerState struct{ value broodlordLashlayerValue }
type broodlordLashlayerValue struct {
	Reference string `json:"reference"`
}

func InitBroodlordLashlayer() *broodlordLashlayer { return new(broodlordLashlayer) }
func (c *broodlordLashlayer) CaptureState(capture func(*characters.StartsNewFight) (string, error)) (BroodlordLashlayerState, error) {
	if c == nil || c.StartsNewFight == nil || c.all == nil || capture == nil {
		return BroodlordLashlayerState{}, fmt.Errorf("missing BroodlordLashlayer dependencies")
	}
	ref, e := capture(c.StartsNewFight)
	if e != nil {
		return BroodlordLashlayerState{}, e
	}
	if ref == "" {
		return BroodlordLashlayerState{}, fmt.Errorf("empty BroodlordLashlayer reference")
	}
	return BroodlordLashlayerState{broodlordLashlayerValue{Reference: ref}}, nil
}
func (s BroodlordLashlayerState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeBroodlordLashlayerState(version uint32, payload []byte) (BroodlordLashlayerState, error) {
	if version != BroodlordLashlayerStateVersion {
		return BroodlordLashlayerState{}, fmt.Errorf("unsupported BroodlordLashlayer version")
	}
	var v broodlordLashlayerValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return BroodlordLashlayerState{}, e
	}
	if v.Reference == "" {
		return BroodlordLashlayerState{}, fmt.Errorf("empty BroodlordLashlayer reference")
	}
	return BroodlordLashlayerState{v}, nil
}
func (c *broodlordLashlayer) RestoreState(s BroodlordLashlayerState, all *characters.Characters, resolve func(string) (*characters.StartsNewFight, error)) error {
	if c == nil || all == nil || resolve == nil || s.value.Reference == "" {
		return fmt.Errorf("missing BroodlordLashlayer destination/dependencies")
	}
	base, e := resolve(s.value.Reference)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil BroodlordLashlayer dependency")
	}
	*c = broodlordLashlayer{StartsNewFight: base, all: all}
	return nil
}

const RazorgoreStateType = "vanilla.Razorgore"
const RazorgoreStateVersion uint32 = 1

type RazorgoreState struct{ value razorgoreValue }
type razorgoreValue struct {
	Reference    string `json:"reference"`
	EggThreshold int    `json:"egg_threshold"`
	EggCount     int    `json:"egg_count"`
	AdsGone      bool   `json:"ads_gone"`
}

func InitRazorgore() *razorgore { return new(razorgore) }
func (c *razorgore) CaptureState(capture func(*characters.Common) (string, error)) (RazorgoreState, error) {
	if c == nil || c.Common == nil || c.all == nil || capture == nil {
		return RazorgoreState{}, fmt.Errorf("missing Razorgore dependencies")
	}
	ref, e := capture(c.Common)
	if e != nil {
		return RazorgoreState{}, e
	}
	if ref == "" {
		return RazorgoreState{}, fmt.Errorf("empty Razorgore reference")
	}
	return RazorgoreState{razorgoreValue{Reference: ref, EggThreshold: c.eggThreshold, EggCount: c.eggCount, AdsGone: c.adsGone}}, nil
}
func (s RazorgoreState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeRazorgoreState(version uint32, payload []byte) (RazorgoreState, error) {
	if version != RazorgoreStateVersion {
		return RazorgoreState{}, fmt.Errorf("unsupported Razorgore version")
	}
	var v razorgoreValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return RazorgoreState{}, e
	}
	if v.Reference == "" {
		return RazorgoreState{}, fmt.Errorf("empty Razorgore reference")
	}
	return RazorgoreState{v}, nil
}
func (c *razorgore) RestoreState(s RazorgoreState, all *characters.Characters, resolve func(string) (*characters.Common, error)) error {
	if c == nil || all == nil || resolve == nil || s.value.Reference == "" {
		return fmt.Errorf("missing Razorgore destination/dependencies")
	}
	base, e := resolve(s.value.Reference)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil Razorgore dependency")
	}
	*c = razorgore{Common: base, all: all, eggThreshold: s.value.EggThreshold, eggCount: s.value.EggCount, adsGone: s.value.AdsGone}
	return nil
}

const ShadowflameSparkStateType = "vanilla.ShadowflameSpark"
const ShadowflameSparkStateVersion uint32 = 1

type ShadowflameSparkState struct{ value shadowflameSparkValue }
type shadowflameSparkValue struct {
	Reference string `json:"reference"`
	Done      bool   `json:"done"`
}

func InitShadowflameSpark() *shadowflameSpark { return new(shadowflameSpark) }
func (c *shadowflameSpark) CaptureState(capture func(*characters.Common) (string, error)) (ShadowflameSparkState, error) {
	if c == nil || c.Common == nil || c.all == nil || capture == nil {
		return ShadowflameSparkState{}, fmt.Errorf("missing ShadowflameSpark dependencies")
	}
	ref, e := capture(c.Common)
	if e != nil {
		return ShadowflameSparkState{}, e
	}
	if ref == "" {
		return ShadowflameSparkState{}, fmt.Errorf("empty ShadowflameSpark reference")
	}
	return ShadowflameSparkState{shadowflameSparkValue{Reference: ref, Done: c.done}}, nil
}
func (s ShadowflameSparkState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeShadowflameSparkState(version uint32, payload []byte) (ShadowflameSparkState, error) {
	if version != ShadowflameSparkStateVersion {
		return ShadowflameSparkState{}, fmt.Errorf("unsupported ShadowflameSpark version")
	}
	var v shadowflameSparkValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return ShadowflameSparkState{}, e
	}
	if v.Reference == "" {
		return ShadowflameSparkState{}, fmt.Errorf("empty ShadowflameSpark reference")
	}
	return ShadowflameSparkState{v}, nil
}
func (c *shadowflameSpark) RestoreState(s ShadowflameSparkState, all *characters.Characters, resolve func(string) (*characters.Common, error)) error {
	if c == nil || all == nil || resolve == nil || s.value.Reference == "" {
		return fmt.Errorf("missing ShadowflameSpark destination/dependencies")
	}
	base, e := resolve(s.value.Reference)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil ShadowflameSpark dependency")
	}
	*c = shadowflameSpark{Common: base, all: all, done: s.value.Done}
	return nil
}
