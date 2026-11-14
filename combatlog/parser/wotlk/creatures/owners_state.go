package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"maps"
	"slices"
)

const AttumenTheHuntsmanStateType = "wotlk.attumenTheHuntsman"
const AttumenTheHuntsmanStateVersion uint32 = 1

type AttumenTheHuntsmanState struct{ value attumenTheHuntsmanValue }
type attumenTheHuntsmanValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *attumenTheHuntsman) CaptureState(ref func(any) (string, error)) (AttumenTheHuntsmanState, error) {
	if c == nil || ref == nil {
		return AttumenTheHuntsmanState{}, fmt.Errorf("missing attumenTheHuntsman capture")
	}
	v := attumenTheHuntsmanValue{}
	if c.Common == nil {
		return AttumenTheHuntsmanState{}, fmt.Errorf("missing attumenTheHuntsman.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return AttumenTheHuntsmanState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return AttumenTheHuntsmanState{}, fmt.Errorf("missing attumenTheHuntsman.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return AttumenTheHuntsmanState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return AttumenTheHuntsmanState{}, e
	}
	return AttumenTheHuntsmanState{v}, nil
}
func (s AttumenTheHuntsmanState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeAttumenTheHuntsmanState(version uint32, payload []byte) (AttumenTheHuntsmanState, error) {
	if version != AttumenTheHuntsmanStateVersion {
		return AttumenTheHuntsmanState{}, fmt.Errorf("unsupported attumenTheHuntsman version")
	}
	var v attumenTheHuntsmanValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return AttumenTheHuntsmanState{}, e
	}
	if e := v.validate(); e != nil {
		return AttumenTheHuntsmanState{}, e
	}
	return AttumenTheHuntsmanState{v}, nil
}
func (v attumenTheHuntsmanValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing attumenTheHuntsman.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing attumenTheHuntsman.all reference")
	}
	return nil
}
func (c *attumenTheHuntsman) RestoreState(s AttumenTheHuntsmanState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := attumenTheHuntsman{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const MalygosPhaseTwoAddStateType = "wotlk.malygosPhaseTwoAdd"
const MalygosPhaseTwoAddStateVersion uint32 = 1

type MalygosPhaseTwoAddState struct{ value malygosPhaseTwoAddValue }
type malygosPhaseTwoAddValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *malygosPhaseTwoAdd) CaptureState(ref func(any) (string, error)) (MalygosPhaseTwoAddState, error) {
	if c == nil || ref == nil {
		return MalygosPhaseTwoAddState{}, fmt.Errorf("missing malygosPhaseTwoAdd capture")
	}
	v := malygosPhaseTwoAddValue{}
	if c.Common == nil {
		return MalygosPhaseTwoAddState{}, fmt.Errorf("missing malygosPhaseTwoAdd.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return MalygosPhaseTwoAddState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return MalygosPhaseTwoAddState{}, fmt.Errorf("missing malygosPhaseTwoAdd.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return MalygosPhaseTwoAddState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return MalygosPhaseTwoAddState{}, e
	}
	return MalygosPhaseTwoAddState{v}, nil
}
func (s MalygosPhaseTwoAddState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeMalygosPhaseTwoAddState(version uint32, payload []byte) (MalygosPhaseTwoAddState, error) {
	if version != MalygosPhaseTwoAddStateVersion {
		return MalygosPhaseTwoAddState{}, fmt.Errorf("unsupported malygosPhaseTwoAdd version")
	}
	var v malygosPhaseTwoAddValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return MalygosPhaseTwoAddState{}, e
	}
	if e := v.validate(); e != nil {
		return MalygosPhaseTwoAddState{}, e
	}
	return MalygosPhaseTwoAddState{v}, nil
}
func (v malygosPhaseTwoAddValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing malygosPhaseTwoAdd.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing malygosPhaseTwoAdd.all reference")
	}
	return nil
}
func (c *malygosPhaseTwoAdd) RestoreState(s MalygosPhaseTwoAddState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := malygosPhaseTwoAdd{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const HalionCharacterStateType = "wotlk.halionCharacter"
const HalionCharacterStateVersion uint32 = 1

type HalionCharacterState struct{ value halionCharacterValue }
type halionCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *halionCharacter) CaptureState(ref func(any) (string, error)) (HalionCharacterState, error) {
	if c == nil || ref == nil {
		return HalionCharacterState{}, fmt.Errorf("missing halionCharacter capture")
	}
	v := halionCharacterValue{}
	if c.Common == nil {
		return HalionCharacterState{}, fmt.Errorf("missing halionCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return HalionCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return HalionCharacterState{}, fmt.Errorf("missing halionCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return HalionCharacterState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return HalionCharacterState{}, e
	}
	return HalionCharacterState{v}, nil
}
func (s HalionCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeHalionCharacterState(version uint32, payload []byte) (HalionCharacterState, error) {
	if version != HalionCharacterStateVersion {
		return HalionCharacterState{}, fmt.Errorf("unsupported halionCharacter version")
	}
	var v halionCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return HalionCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return HalionCharacterState{}, e
	}
	return HalionCharacterState{v}, nil
}
func (v halionCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing halionCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing halionCharacter.all reference")
	}
	return nil
}
func (c *halionCharacter) RestoreState(s HalionCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := halionCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const RazorscaleAddStateType = "wotlk.razorscaleAdd"
const RazorscaleAddStateVersion uint32 = 1

type RazorscaleAddState struct{ value razorscaleAddValue }
type razorscaleAddValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *razorscaleAdd) CaptureState(ref func(any) (string, error)) (RazorscaleAddState, error) {
	if c == nil || ref == nil {
		return RazorscaleAddState{}, fmt.Errorf("missing razorscaleAdd capture")
	}
	v := razorscaleAddValue{}
	if c.Common == nil {
		return RazorscaleAddState{}, fmt.Errorf("missing razorscaleAdd.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return RazorscaleAddState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return RazorscaleAddState{}, fmt.Errorf("missing razorscaleAdd.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return RazorscaleAddState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return RazorscaleAddState{}, e
	}
	return RazorscaleAddState{v}, nil
}
func (s RazorscaleAddState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeRazorscaleAddState(version uint32, payload []byte) (RazorscaleAddState, error) {
	if version != RazorscaleAddStateVersion {
		return RazorscaleAddState{}, fmt.Errorf("unsupported razorscaleAdd version")
	}
	var v razorscaleAddValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return RazorscaleAddState{}, e
	}
	if e := v.validate(); e != nil {
		return RazorscaleAddState{}, e
	}
	return RazorscaleAddState{v}, nil
}
func (v razorscaleAddValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing razorscaleAdd.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing razorscaleAdd.all reference")
	}
	return nil
}
func (c *razorscaleAdd) RestoreState(s RazorscaleAddState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := razorscaleAdd{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const GunshipBattleCharacterStateType = "wotlk.gunshipBattleCharacter"
const GunshipBattleCharacterStateVersion uint32 = 1

type GunshipBattleCharacterState struct{ value gunshipBattleCharacterValue }
type gunshipBattleCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *gunshipBattleCharacter) CaptureState(ref func(any) (string, error)) (GunshipBattleCharacterState, error) {
	if c == nil || ref == nil {
		return GunshipBattleCharacterState{}, fmt.Errorf("missing gunshipBattleCharacter capture")
	}
	v := gunshipBattleCharacterValue{}
	if c.Common == nil {
		return GunshipBattleCharacterState{}, fmt.Errorf("missing gunshipBattleCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return GunshipBattleCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return GunshipBattleCharacterState{}, fmt.Errorf("missing gunshipBattleCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return GunshipBattleCharacterState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return GunshipBattleCharacterState{}, e
	}
	return GunshipBattleCharacterState{v}, nil
}
func (s GunshipBattleCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeGunshipBattleCharacterState(version uint32, payload []byte) (GunshipBattleCharacterState, error) {
	if version != GunshipBattleCharacterStateVersion {
		return GunshipBattleCharacterState{}, fmt.Errorf("unsupported gunshipBattleCharacter version")
	}
	var v gunshipBattleCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return GunshipBattleCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return GunshipBattleCharacterState{}, e
	}
	return GunshipBattleCharacterState{v}, nil
}
func (v gunshipBattleCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing gunshipBattleCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing gunshipBattleCharacter.all reference")
	}
	return nil
}
func (c *gunshipBattleCharacter) RestoreState(s GunshipBattleCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := gunshipBattleCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const ValithriaDreamwalkerCharacterStateType = "wotlk.valithriaDreamwalkerCharacter"
const ValithriaDreamwalkerCharacterStateVersion uint32 = 1

type ValithriaDreamwalkerCharacterState struct {
	value valithriaDreamwalkerCharacterValue
}
type valithriaDreamwalkerCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *valithriaDreamwalkerCharacter) CaptureState(ref func(any) (string, error)) (ValithriaDreamwalkerCharacterState, error) {
	if c == nil || ref == nil {
		return ValithriaDreamwalkerCharacterState{}, fmt.Errorf("missing valithriaDreamwalkerCharacter capture")
	}
	v := valithriaDreamwalkerCharacterValue{}
	if c.Common == nil {
		return ValithriaDreamwalkerCharacterState{}, fmt.Errorf("missing valithriaDreamwalkerCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return ValithriaDreamwalkerCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return ValithriaDreamwalkerCharacterState{}, fmt.Errorf("missing valithriaDreamwalkerCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return ValithriaDreamwalkerCharacterState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return ValithriaDreamwalkerCharacterState{}, e
	}
	return ValithriaDreamwalkerCharacterState{v}, nil
}
func (s ValithriaDreamwalkerCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeValithriaDreamwalkerCharacterState(version uint32, payload []byte) (ValithriaDreamwalkerCharacterState, error) {
	if version != ValithriaDreamwalkerCharacterStateVersion {
		return ValithriaDreamwalkerCharacterState{}, fmt.Errorf("unsupported valithriaDreamwalkerCharacter version")
	}
	var v valithriaDreamwalkerCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return ValithriaDreamwalkerCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return ValithriaDreamwalkerCharacterState{}, e
	}
	return ValithriaDreamwalkerCharacterState{v}, nil
}
func (v valithriaDreamwalkerCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing valithriaDreamwalkerCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing valithriaDreamwalkerCharacter.all reference")
	}
	return nil
}
func (c *valithriaDreamwalkerCharacter) RestoreState(s ValithriaDreamwalkerCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := valithriaDreamwalkerCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const CoilfangGuardianStateType = "wotlk.coilfangGuardian"
const CoilfangGuardianStateVersion uint32 = 1

type CoilfangGuardianState struct{ value coilfangGuardianValue }
type coilfangGuardianValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
}

func (c *coilfangGuardian) CaptureState(ref func(any) (string, error)) (CoilfangGuardianState, error) {
	if c == nil || ref == nil {
		return CoilfangGuardianState{}, fmt.Errorf("missing coilfangGuardian capture")
	}
	v := coilfangGuardianValue{}
	if c.Common == nil {
		return CoilfangGuardianState{}, fmt.Errorf("missing coilfangGuardian.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return CoilfangGuardianState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return CoilfangGuardianState{}, fmt.Errorf("missing coilfangGuardian.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return CoilfangGuardianState{}, e
	}
	v.All = rall
	if e := v.validate(); e != nil {
		return CoilfangGuardianState{}, e
	}
	return CoilfangGuardianState{v}, nil
}
func (s CoilfangGuardianState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeCoilfangGuardianState(version uint32, payload []byte) (CoilfangGuardianState, error) {
	if version != CoilfangGuardianStateVersion {
		return CoilfangGuardianState{}, fmt.Errorf("unsupported coilfangGuardian version")
	}
	var v coilfangGuardianValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return CoilfangGuardianState{}, e
	}
	if e := v.validate(); e != nil {
		return CoilfangGuardianState{}, e
	}
	return CoilfangGuardianState{v}, nil
}
func (v coilfangGuardianValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing coilfangGuardian.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing coilfangGuardian.all reference")
	}
	return nil
}
func (c *coilfangGuardian) RestoreState(s CoilfangGuardianState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := coilfangGuardian{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	*c = candidate
	return nil
}

const KologarnCharacterStateType = "wotlk.kologarnCharacter"
const KologarnCharacterStateVersion uint32 = 1

type KologarnCharacterState struct{ value kologarnCharacterValue }
type kologarnCharacterValue struct {
	Common string `json:"Common"`
	Defeat string `json:"defeat"`
}

func (c *kologarnCharacter) CaptureState(ref func(any) (string, error)) (KologarnCharacterState, error) {
	if c == nil || ref == nil {
		return KologarnCharacterState{}, fmt.Errorf("missing kologarnCharacter capture")
	}
	v := kologarnCharacterValue{}
	if c.Common == nil {
		return KologarnCharacterState{}, fmt.Errorf("missing kologarnCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return KologarnCharacterState{}, e
	}
	v.Common = rCommon
	if c.defeat == nil {
		return KologarnCharacterState{}, fmt.Errorf("missing kologarnCharacter.defeat")
	}
	rdefeat, e := ref(c.defeat)
	if e != nil {
		return KologarnCharacterState{}, e
	}
	v.Defeat = rdefeat
	if e := v.validate(); e != nil {
		return KologarnCharacterState{}, e
	}
	return KologarnCharacterState{v}, nil
}
func (s KologarnCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeKologarnCharacterState(version uint32, payload []byte) (KologarnCharacterState, error) {
	if version != KologarnCharacterStateVersion {
		return KologarnCharacterState{}, fmt.Errorf("unsupported kologarnCharacter version")
	}
	var v kologarnCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return KologarnCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return KologarnCharacterState{}, e
	}
	return KologarnCharacterState{v}, nil
}
func (v kologarnCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing kologarnCharacter.Common reference")
	}
	if v.Defeat == "" {
		return fmt.Errorf("missing kologarnCharacter.defeat reference")
	}
	return nil
}
func (c *kologarnCharacter) RestoreState(s KologarnCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := kologarnCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rdefeat, e := expansionResolve[*characters.ScriptedDefeatDetector](v.Defeat, load)
	if e != nil {
		return e
	}
	candidate.defeat = rdefeat
	*c = candidate
	return nil
}

const HodirCharacterStateType = "wotlk.hodirCharacter"
const HodirCharacterStateVersion uint32 = 1

type HodirCharacterState struct{ value hodirCharacterValue }
type hodirCharacterValue struct {
	Common string `json:"Common"`
	Defeat string `json:"defeat"`
}

func (c *hodirCharacter) CaptureState(ref func(any) (string, error)) (HodirCharacterState, error) {
	if c == nil || ref == nil {
		return HodirCharacterState{}, fmt.Errorf("missing hodirCharacter capture")
	}
	v := hodirCharacterValue{}
	if c.Common == nil {
		return HodirCharacterState{}, fmt.Errorf("missing hodirCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return HodirCharacterState{}, e
	}
	v.Common = rCommon
	if c.defeat == nil {
		return HodirCharacterState{}, fmt.Errorf("missing hodirCharacter.defeat")
	}
	rdefeat, e := ref(c.defeat)
	if e != nil {
		return HodirCharacterState{}, e
	}
	v.Defeat = rdefeat
	if e := v.validate(); e != nil {
		return HodirCharacterState{}, e
	}
	return HodirCharacterState{v}, nil
}
func (s HodirCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeHodirCharacterState(version uint32, payload []byte) (HodirCharacterState, error) {
	if version != HodirCharacterStateVersion {
		return HodirCharacterState{}, fmt.Errorf("unsupported hodirCharacter version")
	}
	var v hodirCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return HodirCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return HodirCharacterState{}, e
	}
	return HodirCharacterState{v}, nil
}
func (v hodirCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing hodirCharacter.Common reference")
	}
	if v.Defeat == "" {
		return fmt.Errorf("missing hodirCharacter.defeat reference")
	}
	return nil
}
func (c *hodirCharacter) RestoreState(s HodirCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := hodirCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rdefeat, e := expansionResolve[*characters.ScriptedDefeatDetector](v.Defeat, load)
	if e != nil {
		return e
	}
	candidate.defeat = rdefeat
	*c = candidate
	return nil
}

const FreyaCharacterStateType = "wotlk.freyaCharacter"
const FreyaCharacterStateVersion uint32 = 1

type FreyaCharacterState struct{ value freyaCharacterValue }
type freyaCharacterValue struct {
	Common string `json:"Common"`
	Defeat string `json:"defeat"`
}

func (c *freyaCharacter) CaptureState(ref func(any) (string, error)) (FreyaCharacterState, error) {
	if c == nil || ref == nil {
		return FreyaCharacterState{}, fmt.Errorf("missing freyaCharacter capture")
	}
	v := freyaCharacterValue{}
	if c.Common == nil {
		return FreyaCharacterState{}, fmt.Errorf("missing freyaCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return FreyaCharacterState{}, e
	}
	v.Common = rCommon
	if c.defeat == nil {
		return FreyaCharacterState{}, fmt.Errorf("missing freyaCharacter.defeat")
	}
	rdefeat, e := ref(c.defeat)
	if e != nil {
		return FreyaCharacterState{}, e
	}
	v.Defeat = rdefeat
	if e := v.validate(); e != nil {
		return FreyaCharacterState{}, e
	}
	return FreyaCharacterState{v}, nil
}
func (s FreyaCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeFreyaCharacterState(version uint32, payload []byte) (FreyaCharacterState, error) {
	if version != FreyaCharacterStateVersion {
		return FreyaCharacterState{}, fmt.Errorf("unsupported freyaCharacter version")
	}
	var v freyaCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return FreyaCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return FreyaCharacterState{}, e
	}
	return FreyaCharacterState{v}, nil
}
func (v freyaCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing freyaCharacter.Common reference")
	}
	if v.Defeat == "" {
		return fmt.Errorf("missing freyaCharacter.defeat reference")
	}
	return nil
}
func (c *freyaCharacter) RestoreState(s FreyaCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := freyaCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rdefeat, e := expansionResolve[*characters.ScriptedDefeatDetector](v.Defeat, load)
	if e != nil {
		return e
	}
	candidate.defeat = rdefeat
	*c = candidate
	return nil
}

const AlgalonCharacterStateType = "wotlk.algalonCharacter"
const AlgalonCharacterStateVersion uint32 = 1

type AlgalonCharacterState struct{ value algalonCharacterValue }
type algalonCharacterValue struct {
	Common         string                 `json:"Common"`
	All            string                 `json:"all"`
	Defeat         string                 `json:"defeat"`
	SeenPlayers    map[guid.GUID]struct{} `json:"seenPlayers"`
	DeadPlayers    map[guid.GUID]struct{} `json:"deadPlayers"`
	IncomingDamage int64                  `json:"incomingDamage"`
}

func (c *algalonCharacter) CaptureState(ref func(any) (string, error)) (AlgalonCharacterState, error) {
	if c == nil || ref == nil {
		return AlgalonCharacterState{}, fmt.Errorf("missing algalonCharacter capture")
	}
	v := algalonCharacterValue{}
	if c.Common == nil {
		return AlgalonCharacterState{}, fmt.Errorf("missing algalonCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return AlgalonCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return AlgalonCharacterState{}, fmt.Errorf("missing algalonCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return AlgalonCharacterState{}, e
	}
	v.All = rall
	if c.defeat == nil {
		return AlgalonCharacterState{}, fmt.Errorf("missing algalonCharacter.defeat")
	}
	rdefeat, e := ref(c.defeat)
	if e != nil {
		return AlgalonCharacterState{}, e
	}
	v.Defeat = rdefeat
	v.SeenPlayers = maps.Clone(c.seenPlayers)
	v.DeadPlayers = maps.Clone(c.deadPlayers)
	v.IncomingDamage = c.incomingDamage
	if e := v.validate(); e != nil {
		return AlgalonCharacterState{}, e
	}
	return AlgalonCharacterState{v}, nil
}
func (s AlgalonCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeAlgalonCharacterState(version uint32, payload []byte) (AlgalonCharacterState, error) {
	if version != AlgalonCharacterStateVersion {
		return AlgalonCharacterState{}, fmt.Errorf("unsupported algalonCharacter version")
	}
	var v algalonCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return AlgalonCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return AlgalonCharacterState{}, e
	}
	return AlgalonCharacterState{v}, nil
}
func (v algalonCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing algalonCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing algalonCharacter.all reference")
	}
	if v.Defeat == "" {
		return fmt.Errorf("missing algalonCharacter.defeat reference")
	}
	if v.SeenPlayers == nil {
		return fmt.Errorf("missing player set")
	}
	if v.DeadPlayers == nil {
		return fmt.Errorf("missing player set")
	}
	return nil
}
func (c *algalonCharacter) RestoreState(s AlgalonCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := algalonCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	rdefeat, e := expansionResolve[*characters.ScriptedDefeatDetector](v.Defeat, load)
	if e != nil {
		return e
	}
	candidate.defeat = rdefeat
	candidate.seenPlayers = maps.Clone(v.SeenPlayers)
	candidate.deadPlayers = maps.Clone(v.DeadPlayers)
	candidate.incomingDamage = v.IncomingDamage
	*c = candidate
	return nil
}

const AssemblyOfIronCharacterStateType = "wotlk.assemblyOfIronCharacter"
const AssemblyOfIronCharacterStateVersion uint32 = 1

type AssemblyOfIronCharacterState struct{ value assemblyOfIronCharacterValue }
type assemblyOfIronCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
	Entry  uint32 `json:"entry"`
}

func (c *assemblyOfIronCharacter) CaptureState(ref func(any) (string, error)) (AssemblyOfIronCharacterState, error) {
	if c == nil || ref == nil {
		return AssemblyOfIronCharacterState{}, fmt.Errorf("missing assemblyOfIronCharacter capture")
	}
	v := assemblyOfIronCharacterValue{}
	if c.Common == nil {
		return AssemblyOfIronCharacterState{}, fmt.Errorf("missing assemblyOfIronCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return AssemblyOfIronCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return AssemblyOfIronCharacterState{}, fmt.Errorf("missing assemblyOfIronCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return AssemblyOfIronCharacterState{}, e
	}
	v.All = rall
	v.Entry = c.entry
	if e := v.validate(); e != nil {
		return AssemblyOfIronCharacterState{}, e
	}
	return AssemblyOfIronCharacterState{v}, nil
}
func (s AssemblyOfIronCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeAssemblyOfIronCharacterState(version uint32, payload []byte) (AssemblyOfIronCharacterState, error) {
	if version != AssemblyOfIronCharacterStateVersion {
		return AssemblyOfIronCharacterState{}, fmt.Errorf("unsupported assemblyOfIronCharacter version")
	}
	var v assemblyOfIronCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return AssemblyOfIronCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return AssemblyOfIronCharacterState{}, e
	}
	return AssemblyOfIronCharacterState{v}, nil
}
func (v assemblyOfIronCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing assemblyOfIronCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing assemblyOfIronCharacter.all reference")
	}
	return nil
}
func (c *assemblyOfIronCharacter) RestoreState(s AssemblyOfIronCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := assemblyOfIronCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	candidate.entry = v.Entry
	*c = candidate
	return nil
}

const LadyDeathwhisperCharacterStateType = "wotlk.ladyDeathwhisperCharacter"
const LadyDeathwhisperCharacterStateVersion uint32 = 1

type LadyDeathwhisperCharacterState struct {
	value ladyDeathwhisperCharacterValue
}
type ladyDeathwhisperCharacterValue struct {
	Common   string `json:"Common"`
	All      string `json:"all"`
	PhaseTwo bool   `json:"phaseTwo"`
}

func (c *ladyDeathwhisperCharacter) CaptureState(ref func(any) (string, error)) (LadyDeathwhisperCharacterState, error) {
	if c == nil || ref == nil {
		return LadyDeathwhisperCharacterState{}, fmt.Errorf("missing ladyDeathwhisperCharacter capture")
	}
	v := ladyDeathwhisperCharacterValue{}
	if c.Common == nil {
		return LadyDeathwhisperCharacterState{}, fmt.Errorf("missing ladyDeathwhisperCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return LadyDeathwhisperCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return LadyDeathwhisperCharacterState{}, fmt.Errorf("missing ladyDeathwhisperCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return LadyDeathwhisperCharacterState{}, e
	}
	v.All = rall
	v.PhaseTwo = c.phaseTwo
	if e := v.validate(); e != nil {
		return LadyDeathwhisperCharacterState{}, e
	}
	return LadyDeathwhisperCharacterState{v}, nil
}
func (s LadyDeathwhisperCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeLadyDeathwhisperCharacterState(version uint32, payload []byte) (LadyDeathwhisperCharacterState, error) {
	if version != LadyDeathwhisperCharacterStateVersion {
		return LadyDeathwhisperCharacterState{}, fmt.Errorf("unsupported ladyDeathwhisperCharacter version")
	}
	var v ladyDeathwhisperCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return LadyDeathwhisperCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return LadyDeathwhisperCharacterState{}, e
	}
	return LadyDeathwhisperCharacterState{v}, nil
}
func (v ladyDeathwhisperCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing ladyDeathwhisperCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing ladyDeathwhisperCharacter.all reference")
	}
	return nil
}
func (c *ladyDeathwhisperCharacter) RestoreState(s LadyDeathwhisperCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := ladyDeathwhisperCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	candidate.phaseTwo = v.PhaseTwo
	*c = candidate
	return nil
}

const ProfessorPutricideCharacterStateType = "wotlk.professorPutricideCharacter"
const ProfessorPutricideCharacterStateVersion uint32 = 1

type ProfessorPutricideCharacterState struct {
	value professorPutricideCharacterValue
}
type professorPutricideCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
	Phase  int    `json:"phase"`
}

func (c *professorPutricideCharacter) CaptureState(ref func(any) (string, error)) (ProfessorPutricideCharacterState, error) {
	if c == nil || ref == nil {
		return ProfessorPutricideCharacterState{}, fmt.Errorf("missing professorPutricideCharacter capture")
	}
	v := professorPutricideCharacterValue{}
	if c.Common == nil {
		return ProfessorPutricideCharacterState{}, fmt.Errorf("missing professorPutricideCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return ProfessorPutricideCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return ProfessorPutricideCharacterState{}, fmt.Errorf("missing professorPutricideCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return ProfessorPutricideCharacterState{}, e
	}
	v.All = rall
	v.Phase = c.phase
	if e := v.validate(); e != nil {
		return ProfessorPutricideCharacterState{}, e
	}
	return ProfessorPutricideCharacterState{v}, nil
}
func (s ProfessorPutricideCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeProfessorPutricideCharacterState(version uint32, payload []byte) (ProfessorPutricideCharacterState, error) {
	if version != ProfessorPutricideCharacterStateVersion {
		return ProfessorPutricideCharacterState{}, fmt.Errorf("unsupported professorPutricideCharacter version")
	}
	var v professorPutricideCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return ProfessorPutricideCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return ProfessorPutricideCharacterState{}, e
	}
	return ProfessorPutricideCharacterState{v}, nil
}
func (v professorPutricideCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing professorPutricideCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing professorPutricideCharacter.all reference")
	}
	if v.Phase < 0 || v.Phase > 3 {
		return fmt.Errorf("invalid phase")
	}
	return nil
}
func (c *professorPutricideCharacter) RestoreState(s ProfessorPutricideCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := professorPutricideCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	candidate.phase = v.Phase
	*c = candidate
	return nil
}

const SindragosaCharacterStateType = "wotlk.sindragosaCharacter"
const SindragosaCharacterStateVersion uint32 = 1

type SindragosaCharacterState struct{ value sindragosaCharacterValue }
type sindragosaCharacterValue struct {
	Common     string `json:"Common"`
	All        string `json:"all"`
	FinalPhase bool   `json:"finalPhase"`
}

func (c *sindragosaCharacter) CaptureState(ref func(any) (string, error)) (SindragosaCharacterState, error) {
	if c == nil || ref == nil {
		return SindragosaCharacterState{}, fmt.Errorf("missing sindragosaCharacter capture")
	}
	v := sindragosaCharacterValue{}
	if c.Common == nil {
		return SindragosaCharacterState{}, fmt.Errorf("missing sindragosaCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return SindragosaCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return SindragosaCharacterState{}, fmt.Errorf("missing sindragosaCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return SindragosaCharacterState{}, e
	}
	v.All = rall
	v.FinalPhase = c.finalPhase
	if e := v.validate(); e != nil {
		return SindragosaCharacterState{}, e
	}
	return SindragosaCharacterState{v}, nil
}
func (s SindragosaCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeSindragosaCharacterState(version uint32, payload []byte) (SindragosaCharacterState, error) {
	if version != SindragosaCharacterStateVersion {
		return SindragosaCharacterState{}, fmt.Errorf("unsupported sindragosaCharacter version")
	}
	var v sindragosaCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return SindragosaCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return SindragosaCharacterState{}, e
	}
	return SindragosaCharacterState{v}, nil
}
func (v sindragosaCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing sindragosaCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing sindragosaCharacter.all reference")
	}
	return nil
}
func (c *sindragosaCharacter) RestoreState(s SindragosaCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := sindragosaCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	candidate.finalPhase = v.FinalPhase
	*c = candidate
	return nil
}

const LichKingCharacterStateType = "wotlk.lichKingCharacter"
const LichKingCharacterStateVersion uint32 = 1

type LichKingCharacterState struct{ value lichKingCharacterValue }
type lichKingCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
	Phase  int    `json:"phase"`
}

func (c *lichKingCharacter) CaptureState(ref func(any) (string, error)) (LichKingCharacterState, error) {
	if c == nil || ref == nil {
		return LichKingCharacterState{}, fmt.Errorf("missing lichKingCharacter capture")
	}
	v := lichKingCharacterValue{}
	if c.Common == nil {
		return LichKingCharacterState{}, fmt.Errorf("missing lichKingCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return LichKingCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return LichKingCharacterState{}, fmt.Errorf("missing lichKingCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return LichKingCharacterState{}, e
	}
	v.All = rall
	v.Phase = c.phase
	if e := v.validate(); e != nil {
		return LichKingCharacterState{}, e
	}
	return LichKingCharacterState{v}, nil
}
func (s LichKingCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeLichKingCharacterState(version uint32, payload []byte) (LichKingCharacterState, error) {
	if version != LichKingCharacterStateVersion {
		return LichKingCharacterState{}, fmt.Errorf("unsupported lichKingCharacter version")
	}
	var v lichKingCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return LichKingCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return LichKingCharacterState{}, e
	}
	return LichKingCharacterState{v}, nil
}
func (v lichKingCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing lichKingCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing lichKingCharacter.all reference")
	}
	if v.Phase < 0 || v.Phase > 6 {
		return fmt.Errorf("invalid phase")
	}
	return nil
}
func (c *lichKingCharacter) RestoreState(s LichKingCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := lichKingCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	candidate.phase = v.Phase
	*c = candidate
	return nil
}

const MimironCharacterStateType = "wotlk.mimironCharacter"
const MimironCharacterStateVersion uint32 = 1

type MimironCharacterState struct{ value mimironCharacterValue }
type mimironCharacterValue struct {
	Common string      `json:"Common"`
	All    string      `json:"all"`
	State  string      `json:"state"`
	Entry  uint32      `json:"entry"`
	Role   mimironRole `json:"role"`
}

func (c *mimironCharacter) CaptureState(ref func(any) (string, error)) (MimironCharacterState, error) {
	if c == nil || ref == nil {
		return MimironCharacterState{}, fmt.Errorf("missing mimironCharacter capture")
	}
	v := mimironCharacterValue{}
	if c.Common == nil {
		return MimironCharacterState{}, fmt.Errorf("missing mimironCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return MimironCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return MimironCharacterState{}, fmt.Errorf("missing mimironCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return MimironCharacterState{}, e
	}
	v.All = rall
	if c.state == nil {
		return MimironCharacterState{}, fmt.Errorf("missing mimironCharacter.state")
	}
	rstate, e := ref(c.state)
	if e != nil {
		return MimironCharacterState{}, e
	}
	v.State = rstate
	v.Entry = c.entry
	v.Role = c.role
	if e := v.validate(); e != nil {
		return MimironCharacterState{}, e
	}
	return MimironCharacterState{v}, nil
}
func (s MimironCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeMimironCharacterState(version uint32, payload []byte) (MimironCharacterState, error) {
	if version != MimironCharacterStateVersion {
		return MimironCharacterState{}, fmt.Errorf("unsupported mimironCharacter version")
	}
	var v mimironCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return MimironCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return MimironCharacterState{}, e
	}
	return MimironCharacterState{v}, nil
}
func (v mimironCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing mimironCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing mimironCharacter.all reference")
	}
	if v.State == "" {
		return fmt.Errorf("missing mimironCharacter.state reference")
	}
	if v.Role < mimironRoleLeviathan || v.Role > mimironRoleAerial {
		return fmt.Errorf("invalid mimiron role")
	}
	return nil
}
func (c *mimironCharacter) RestoreState(s MimironCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := mimironCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	rstate, e := expansionResolve[*mimironState](v.State, resolve)
	if e != nil {
		return e
	}
	candidate.state = rstate
	candidate.entry = v.Entry
	candidate.role = v.Role
	*c = candidate
	return nil
}

const MimironStateStateType = "wotlk.mimironState"
const MimironStateStateVersion uint32 = 1

type MimironStateState struct{ value mimironStateValue }
type mimironStateValue struct {
	Phase             int                  `json:"phase"`
	PhaseSource       guid.GUID            `json:"phaseSource"`
	Characters        map[guid.GUID]string `json:"characters"`
	PhaseFourDamaged  map[mimironRole]bool `json:"phaseFourDamaged"`
	PhaseFourDefeated map[mimironRole]bool `json:"phaseFourDefeated"`
}

func (c *mimironState) CaptureState(ref func(any) (string, error)) (MimironStateState, error) {
	if c == nil || ref == nil {
		return MimironStateState{}, fmt.Errorf("missing mimironState capture")
	}
	v := mimironStateValue{}
	v.Phase = c.phase
	v.PhaseSource = c.phaseSource
	if c.characters != nil {
		v.Characters = make(map[guid.GUID]string, len(c.characters))
		for _, id := range slices.Sorted(maps.Keys(c.characters)) {
			if c.characters[id] == nil {
				return MimironStateState{}, fmt.Errorf("nil party member")
			}
			r, e := ref(c.characters[id])
			if e != nil {
				return MimironStateState{}, e
			}
			v.Characters[id] = r
		}
	}
	v.PhaseFourDamaged = maps.Clone(c.phaseFourDamaged)
	v.PhaseFourDefeated = maps.Clone(c.phaseFourDefeated)
	if e := v.validate(); e != nil {
		return MimironStateState{}, e
	}
	return MimironStateState{v}, nil
}
func (s MimironStateState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeMimironStateState(version uint32, payload []byte) (MimironStateState, error) {
	if version != MimironStateStateVersion {
		return MimironStateState{}, fmt.Errorf("unsupported mimironState version")
	}
	var v mimironStateValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return MimironStateState{}, e
	}
	if e := v.validate(); e != nil {
		return MimironStateState{}, e
	}
	return MimironStateState{v}, nil
}
func (v mimironStateValue) validate() error {
	if v.Phase < 0 || v.Phase > 4 {
		return fmt.Errorf("invalid phase")
	}
	if v.Characters == nil {
		return fmt.Errorf("missing party map")
	}
	for _, r := range v.Characters {
		if r == "" {
			return fmt.Errorf("empty party member")
		}
	}
	for role := range v.PhaseFourDamaged {
		if role < mimironRoleLeviathan || role > mimironRoleAerial {
			return fmt.Errorf("invalid mimiron role map")
		}
	}
	for role := range v.PhaseFourDefeated {
		if role < mimironRoleLeviathan || role > mimironRoleAerial {
			return fmt.Errorf("invalid mimiron role map")
		}
	}
	return nil
}
func (c *mimironState) RestoreState(s MimironStateState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := mimironState{}
	candidate.phase = v.Phase
	candidate.phaseSource = v.PhaseSource
	candidate.characters = make(map[guid.GUID]*mimironCharacter, len(v.Characters))
	for _, id := range slices.Sorted(maps.Keys(v.Characters)) {
		member, e := expansionResolve[*mimironCharacter](v.Characters[id], resolve)
		if e != nil {
			return e
		}
		candidate.characters[id] = member
	}
	candidate.phaseFourDamaged = maps.Clone(v.PhaseFourDamaged)
	candidate.phaseFourDefeated = maps.Clone(v.PhaseFourDefeated)
	*c = candidate
	return nil
}

const ThorimCharacterStateType = "wotlk.thorimCharacter"
const ThorimCharacterStateVersion uint32 = 1

type ThorimCharacterState struct{ value thorimCharacterValue }
type thorimCharacterValue struct {
	RoomMechanic string `json:"RoomMechanic"`
	All          string `json:"all"`
	State        string `json:"state"`
	Entry        uint32 `json:"entry"`
	Defeat       string `json:"defeat"`
}

func (c *thorimCharacter) CaptureState(ref func(any) (string, error)) (ThorimCharacterState, error) {
	if c == nil || ref == nil {
		return ThorimCharacterState{}, fmt.Errorf("missing thorimCharacter capture")
	}
	v := thorimCharacterValue{}
	if c.RoomMechanic == nil {
		return ThorimCharacterState{}, fmt.Errorf("missing thorimCharacter.RoomMechanic")
	}
	rRoomMechanic, e := ref(c.RoomMechanic)
	if e != nil {
		return ThorimCharacterState{}, e
	}
	v.RoomMechanic = rRoomMechanic
	if c.all == nil {
		return ThorimCharacterState{}, fmt.Errorf("missing thorimCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return ThorimCharacterState{}, e
	}
	v.All = rall
	if c.state == nil {
		return ThorimCharacterState{}, fmt.Errorf("missing thorimCharacter.state")
	}
	rstate, e := ref(c.state)
	if e != nil {
		return ThorimCharacterState{}, e
	}
	v.State = rstate
	v.Entry = c.entry
	if c.defeat != nil {
		rdefeat, e := ref(c.defeat)
		if e != nil {
			return ThorimCharacterState{}, e
		}
		v.Defeat = rdefeat
	}
	if e := v.validate(); e != nil {
		return ThorimCharacterState{}, e
	}
	return ThorimCharacterState{v}, nil
}
func (s ThorimCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeThorimCharacterState(version uint32, payload []byte) (ThorimCharacterState, error) {
	if version != ThorimCharacterStateVersion {
		return ThorimCharacterState{}, fmt.Errorf("unsupported thorimCharacter version")
	}
	var v thorimCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return ThorimCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return ThorimCharacterState{}, e
	}
	return ThorimCharacterState{v}, nil
}
func (v thorimCharacterValue) validate() error {
	if v.RoomMechanic == "" {
		return fmt.Errorf("missing thorimCharacter.RoomMechanic reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing thorimCharacter.all reference")
	}
	if v.State == "" {
		return fmt.Errorf("missing thorimCharacter.state reference")
	}
	return nil
}
func (c *thorimCharacter) RestoreState(s ThorimCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := thorimCharacter{}
	rRoomMechanic, e := expansionResolve[*characters.RoomMechanic](v.RoomMechanic, load)
	if e != nil {
		return e
	}
	candidate.RoomMechanic = rRoomMechanic
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	rstate, e := expansionResolve[*thorimState](v.State, resolve)
	if e != nil {
		return e
	}
	candidate.state = rstate
	candidate.entry = v.Entry
	if v.Defeat != "" {
		rdefeat, e := expansionResolve[*characters.ScriptedDefeatDetector](v.Defeat, load)
		if e != nil {
			return e
		}
		candidate.defeat = rdefeat
	}
	*c = candidate
	return nil
}

const ThorimStateStateType = "wotlk.thorimState"
const ThorimStateStateVersion uint32 = 1

type ThorimStateState struct{ value thorimStateValue }
type thorimStateValue struct {
	Phase       int                  `json:"phase"`
	PhaseSource guid.GUID            `json:"phaseSource"`
	Characters  map[guid.GUID]string `json:"characters"`
}

func (c *thorimState) CaptureState(ref func(any) (string, error)) (ThorimStateState, error) {
	if c == nil || ref == nil {
		return ThorimStateState{}, fmt.Errorf("missing thorimState capture")
	}
	v := thorimStateValue{}
	v.Phase = c.phase
	v.PhaseSource = c.phaseSource
	if c.characters != nil {
		v.Characters = make(map[guid.GUID]string, len(c.characters))
		for _, id := range slices.Sorted(maps.Keys(c.characters)) {
			if c.characters[id] == nil {
				return ThorimStateState{}, fmt.Errorf("nil party member")
			}
			r, e := ref(c.characters[id])
			if e != nil {
				return ThorimStateState{}, e
			}
			v.Characters[id] = r
		}
	}
	if e := v.validate(); e != nil {
		return ThorimStateState{}, e
	}
	return ThorimStateState{v}, nil
}
func (s ThorimStateState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeThorimStateState(version uint32, payload []byte) (ThorimStateState, error) {
	if version != ThorimStateStateVersion {
		return ThorimStateState{}, fmt.Errorf("unsupported thorimState version")
	}
	var v thorimStateValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return ThorimStateState{}, e
	}
	if e := v.validate(); e != nil {
		return ThorimStateState{}, e
	}
	return ThorimStateState{v}, nil
}
func (v thorimStateValue) validate() error {
	if v.Phase < 1 || v.Phase > 3 {
		return fmt.Errorf("invalid phase")
	}
	if v.Characters == nil {
		return fmt.Errorf("missing party map")
	}
	for _, r := range v.Characters {
		if r == "" {
			return fmt.Errorf("empty party member")
		}
	}
	return nil
}
func (c *thorimState) RestoreState(s ThorimStateState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := thorimState{}
	candidate.phase = v.Phase
	candidate.phaseSource = v.PhaseSource
	candidate.characters = make(map[guid.GUID]*thorimCharacter, len(v.Characters))
	for _, id := range slices.Sorted(maps.Keys(v.Characters)) {
		member, e := expansionResolve[*thorimCharacter](v.Characters[id], resolve)
		if e != nil {
			return e
		}
		candidate.characters[id] = member
	}
	*c = candidate
	return nil
}

const ReliquaryCharacterStateType = "wotlk.reliquaryCharacter"
const ReliquaryCharacterStateVersion uint32 = 1

type ReliquaryCharacterState struct{ value reliquaryCharacterValue }
type reliquaryCharacterValue struct {
	RoomMechanic string `json:"RoomMechanic"`
	All          string `json:"all"`
	State        string `json:"state"`
}

func (c *reliquaryCharacter) CaptureState(ref func(any) (string, error)) (ReliquaryCharacterState, error) {
	if c == nil || ref == nil {
		return ReliquaryCharacterState{}, fmt.Errorf("missing reliquaryCharacter capture")
	}
	v := reliquaryCharacterValue{}
	if c.RoomMechanic == nil {
		return ReliquaryCharacterState{}, fmt.Errorf("missing reliquaryCharacter.RoomMechanic")
	}
	rRoomMechanic, e := ref(c.RoomMechanic)
	if e != nil {
		return ReliquaryCharacterState{}, e
	}
	v.RoomMechanic = rRoomMechanic
	if c.all == nil {
		return ReliquaryCharacterState{}, fmt.Errorf("missing reliquaryCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return ReliquaryCharacterState{}, e
	}
	v.All = rall
	if c.state == nil {
		return ReliquaryCharacterState{}, fmt.Errorf("missing reliquaryCharacter.state")
	}
	rstate, e := ref(c.state)
	if e != nil {
		return ReliquaryCharacterState{}, e
	}
	v.State = rstate
	if e := v.validate(); e != nil {
		return ReliquaryCharacterState{}, e
	}
	return ReliquaryCharacterState{v}, nil
}
func (s ReliquaryCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeReliquaryCharacterState(version uint32, payload []byte) (ReliquaryCharacterState, error) {
	if version != ReliquaryCharacterStateVersion {
		return ReliquaryCharacterState{}, fmt.Errorf("unsupported reliquaryCharacter version")
	}
	var v reliquaryCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return ReliquaryCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return ReliquaryCharacterState{}, e
	}
	return ReliquaryCharacterState{v}, nil
}
func (v reliquaryCharacterValue) validate() error {
	if v.RoomMechanic == "" {
		return fmt.Errorf("missing reliquaryCharacter.RoomMechanic reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing reliquaryCharacter.all reference")
	}
	if v.State == "" {
		return fmt.Errorf("missing reliquaryCharacter.state reference")
	}
	return nil
}
func (c *reliquaryCharacter) RestoreState(s ReliquaryCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := reliquaryCharacter{}
	rRoomMechanic, e := expansionResolve[*characters.RoomMechanic](v.RoomMechanic, load)
	if e != nil {
		return e
	}
	candidate.RoomMechanic = rRoomMechanic
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	rstate, e := expansionResolve[*reliquaryState](v.State, resolve)
	if e != nil {
		return e
	}
	candidate.state = rstate
	*c = candidate
	return nil
}

const ReliquaryStateStateType = "wotlk.reliquaryState"
const ReliquaryStateStateVersion uint32 = 1

type ReliquaryStateState struct{ value reliquaryStateValue }
type reliquaryStateValue struct {
	Phase       int                  `json:"phase"`
	PhaseSource guid.GUID            `json:"phaseSource"`
	Characters  map[guid.GUID]string `json:"characters"`
}

func (c *reliquaryState) CaptureState(ref func(any) (string, error)) (ReliquaryStateState, error) {
	if c == nil || ref == nil {
		return ReliquaryStateState{}, fmt.Errorf("missing reliquaryState capture")
	}
	v := reliquaryStateValue{}
	v.Phase = c.phase
	v.PhaseSource = c.phaseSource
	if c.characters != nil {
		v.Characters = make(map[guid.GUID]string, len(c.characters))
		for _, id := range slices.Sorted(maps.Keys(c.characters)) {
			if c.characters[id] == nil {
				return ReliquaryStateState{}, fmt.Errorf("nil party member")
			}
			r, e := ref(c.characters[id])
			if e != nil {
				return ReliquaryStateState{}, e
			}
			v.Characters[id] = r
		}
	}
	if e := v.validate(); e != nil {
		return ReliquaryStateState{}, e
	}
	return ReliquaryStateState{v}, nil
}
func (s ReliquaryStateState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeReliquaryStateState(version uint32, payload []byte) (ReliquaryStateState, error) {
	if version != ReliquaryStateStateVersion {
		return ReliquaryStateState{}, fmt.Errorf("unsupported reliquaryState version")
	}
	var v reliquaryStateValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return ReliquaryStateState{}, e
	}
	if e := v.validate(); e != nil {
		return ReliquaryStateState{}, e
	}
	return ReliquaryStateState{v}, nil
}
func (v reliquaryStateValue) validate() error {
	if v.Phase < 1 || v.Phase > 3 {
		return fmt.Errorf("invalid phase")
	}
	if v.Characters == nil {
		return fmt.Errorf("missing party map")
	}
	for _, r := range v.Characters {
		if r == "" {
			return fmt.Errorf("empty party member")
		}
	}
	return nil
}
func (c *reliquaryState) RestoreState(s ReliquaryStateState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := reliquaryState{}
	candidate.phase = v.Phase
	candidate.phaseSource = v.PhaseSource
	candidate.characters = make(map[guid.GUID]*reliquaryCharacter, len(v.Characters))
	for _, id := range slices.Sorted(maps.Keys(v.Characters)) {
		member, e := expansionResolve[*reliquaryCharacter](v.Characters[id], resolve)
		if e != nil {
			return e
		}
		candidate.characters[id] = member
	}
	*c = candidate
	return nil
}

const KaelThasCharacterStateType = "wotlk.kaelThasCharacter"
const KaelThasCharacterStateVersion uint32 = 1

type KaelThasCharacterState struct{ value kaelThasCharacterValue }
type kaelThasCharacterValue struct {
	RoomMechanic string `json:"RoomMechanic"`
	All          string `json:"all"`
	State        string `json:"state"`
}

func (c *kaelThasCharacter) CaptureState(ref func(any) (string, error)) (KaelThasCharacterState, error) {
	if c == nil || ref == nil {
		return KaelThasCharacterState{}, fmt.Errorf("missing kaelThasCharacter capture")
	}
	v := kaelThasCharacterValue{}
	if c.RoomMechanic == nil {
		return KaelThasCharacterState{}, fmt.Errorf("missing kaelThasCharacter.RoomMechanic")
	}
	rRoomMechanic, e := ref(c.RoomMechanic)
	if e != nil {
		return KaelThasCharacterState{}, e
	}
	v.RoomMechanic = rRoomMechanic
	if c.all == nil {
		return KaelThasCharacterState{}, fmt.Errorf("missing kaelThasCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return KaelThasCharacterState{}, e
	}
	v.All = rall
	if c.state == nil {
		return KaelThasCharacterState{}, fmt.Errorf("missing kaelThasCharacter.state")
	}
	rstate, e := ref(c.state)
	if e != nil {
		return KaelThasCharacterState{}, e
	}
	v.State = rstate
	if e := v.validate(); e != nil {
		return KaelThasCharacterState{}, e
	}
	return KaelThasCharacterState{v}, nil
}
func (s KaelThasCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeKaelThasCharacterState(version uint32, payload []byte) (KaelThasCharacterState, error) {
	if version != KaelThasCharacterStateVersion {
		return KaelThasCharacterState{}, fmt.Errorf("unsupported kaelThasCharacter version")
	}
	var v kaelThasCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return KaelThasCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return KaelThasCharacterState{}, e
	}
	return KaelThasCharacterState{v}, nil
}
func (v kaelThasCharacterValue) validate() error {
	if v.RoomMechanic == "" {
		return fmt.Errorf("missing kaelThasCharacter.RoomMechanic reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing kaelThasCharacter.all reference")
	}
	if v.State == "" {
		return fmt.Errorf("missing kaelThasCharacter.state reference")
	}
	return nil
}
func (c *kaelThasCharacter) RestoreState(s KaelThasCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := kaelThasCharacter{}
	rRoomMechanic, e := expansionResolve[*characters.RoomMechanic](v.RoomMechanic, load)
	if e != nil {
		return e
	}
	candidate.RoomMechanic = rRoomMechanic
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	rstate, e := expansionResolve[*kaelThasState](v.State, resolve)
	if e != nil {
		return e
	}
	candidate.state = rstate
	*c = candidate
	return nil
}

const KaelThasStateStateType = "wotlk.kaelThasState"
const KaelThasStateStateVersion uint32 = 1

type KaelThasStateState struct{ value kaelThasStateValue }
type kaelThasStateValue struct {
	Phase               int                  `json:"phase"`
	PhaseSource         guid.GUID            `json:"phaseSource"`
	Characters          map[guid.GUID]string `json:"characters"`
	WeaponDeathObserved bool                 `json:"weaponDeathObserved"`
}

func (c *kaelThasState) CaptureState(ref func(any) (string, error)) (KaelThasStateState, error) {
	if c == nil || ref == nil {
		return KaelThasStateState{}, fmt.Errorf("missing kaelThasState capture")
	}
	v := kaelThasStateValue{}
	v.Phase = c.phase
	v.PhaseSource = c.phaseSource
	if c.characters != nil {
		v.Characters = make(map[guid.GUID]string, len(c.characters))
		for _, id := range slices.Sorted(maps.Keys(c.characters)) {
			if c.characters[id] == nil {
				return KaelThasStateState{}, fmt.Errorf("nil party member")
			}
			r, e := ref(c.characters[id])
			if e != nil {
				return KaelThasStateState{}, e
			}
			v.Characters[id] = r
		}
	}
	v.WeaponDeathObserved = c.weaponDeathObserved
	if e := v.validate(); e != nil {
		return KaelThasStateState{}, e
	}
	return KaelThasStateState{v}, nil
}
func (s KaelThasStateState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeKaelThasStateState(version uint32, payload []byte) (KaelThasStateState, error) {
	if version != KaelThasStateStateVersion {
		return KaelThasStateState{}, fmt.Errorf("unsupported kaelThasState version")
	}
	var v kaelThasStateValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return KaelThasStateState{}, e
	}
	if e := v.validate(); e != nil {
		return KaelThasStateState{}, e
	}
	return KaelThasStateState{v}, nil
}
func (v kaelThasStateValue) validate() error {
	if v.Phase < 1 || v.Phase > 4 {
		return fmt.Errorf("invalid phase")
	}
	if v.Characters == nil {
		return fmt.Errorf("missing party map")
	}
	for _, r := range v.Characters {
		if r == "" {
			return fmt.Errorf("empty party member")
		}
	}
	return nil
}
func (c *kaelThasState) RestoreState(s KaelThasStateState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := kaelThasState{}
	candidate.phase = v.Phase
	candidate.phaseSource = v.PhaseSource
	candidate.characters = make(map[guid.GUID]*kaelThasCharacter, len(v.Characters))
	for _, id := range slices.Sorted(maps.Keys(v.Characters)) {
		member, e := expansionResolve[*kaelThasCharacter](v.Characters[id], resolve)
		if e != nil {
			return e
		}
		candidate.characters[id] = member
	}
	candidate.weaponDeathObserved = v.WeaponDeathObserved
	*c = candidate
	return nil
}

const YoggSaronCharacterStateType = "wotlk.yoggSaronCharacter"
const YoggSaronCharacterStateVersion uint32 = 1

type YoggSaronCharacterState struct{ value yoggSaronCharacterValue }
type yoggSaronCharacterValue struct {
	Common string `json:"Common"`
	All    string `json:"all"`
	State  string `json:"state"`
	Entry  uint32 `json:"entry"`
}

func (c *yoggSaronCharacter) CaptureState(ref func(any) (string, error)) (YoggSaronCharacterState, error) {
	if c == nil || ref == nil {
		return YoggSaronCharacterState{}, fmt.Errorf("missing yoggSaronCharacter capture")
	}
	v := yoggSaronCharacterValue{}
	if c.Common == nil {
		return YoggSaronCharacterState{}, fmt.Errorf("missing yoggSaronCharacter.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return YoggSaronCharacterState{}, e
	}
	v.Common = rCommon
	if c.all == nil {
		return YoggSaronCharacterState{}, fmt.Errorf("missing yoggSaronCharacter.all")
	}
	rall, e := ref(c.all)
	if e != nil {
		return YoggSaronCharacterState{}, e
	}
	v.All = rall
	if c.state == nil {
		return YoggSaronCharacterState{}, fmt.Errorf("missing yoggSaronCharacter.state")
	}
	rstate, e := ref(c.state)
	if e != nil {
		return YoggSaronCharacterState{}, e
	}
	v.State = rstate
	v.Entry = c.entry
	if e := v.validate(); e != nil {
		return YoggSaronCharacterState{}, e
	}
	return YoggSaronCharacterState{v}, nil
}
func (s YoggSaronCharacterState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeYoggSaronCharacterState(version uint32, payload []byte) (YoggSaronCharacterState, error) {
	if version != YoggSaronCharacterStateVersion {
		return YoggSaronCharacterState{}, fmt.Errorf("unsupported yoggSaronCharacter version")
	}
	var v yoggSaronCharacterValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return YoggSaronCharacterState{}, e
	}
	if e := v.validate(); e != nil {
		return YoggSaronCharacterState{}, e
	}
	return YoggSaronCharacterState{v}, nil
}
func (v yoggSaronCharacterValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing yoggSaronCharacter.Common reference")
	}
	if v.All == "" {
		return fmt.Errorf("missing yoggSaronCharacter.all reference")
	}
	if v.State == "" {
		return fmt.Errorf("missing yoggSaronCharacter.state reference")
	}
	return nil
}
func (c *yoggSaronCharacter) RestoreState(s YoggSaronCharacterState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := yoggSaronCharacter{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rall, e := expansionResolve[*characters.Characters](v.All, resolve)
	if e != nil {
		return e
	}
	candidate.all = rall
	rstate, e := expansionResolve[*yoggSaronState](v.State, resolve)
	if e != nil {
		return e
	}
	candidate.state = rstate
	candidate.entry = v.Entry
	*c = candidate
	return nil
}

const YoggSaronStateStateType = "wotlk.yoggSaronState"
const YoggSaronStateStateVersion uint32 = 1

type YoggSaronStateState struct{ value yoggSaronStateValue }
type yoggSaronStateValue struct {
	Phase       int                  `json:"phase"`
	PhaseSource guid.GUID            `json:"phaseSource"`
	Characters  map[guid.GUID]string `json:"characters"`
	CurrentSara string               `json:"currentSara"`
}

func (c *yoggSaronState) CaptureState(ref func(any) (string, error)) (YoggSaronStateState, error) {
	if c == nil || ref == nil {
		return YoggSaronStateState{}, fmt.Errorf("missing yoggSaronState capture")
	}
	v := yoggSaronStateValue{}
	v.Phase = c.phase
	v.PhaseSource = c.phaseSource
	if c.characters != nil {
		v.Characters = make(map[guid.GUID]string, len(c.characters))
		for _, id := range slices.Sorted(maps.Keys(c.characters)) {
			if c.characters[id] == nil {
				return YoggSaronStateState{}, fmt.Errorf("nil party member")
			}
			r, e := ref(c.characters[id])
			if e != nil {
				return YoggSaronStateState{}, e
			}
			v.Characters[id] = r
		}
	}
	if c.currentSara != nil {
		rcurrentSara, e := ref(c.currentSara)
		if e != nil {
			return YoggSaronStateState{}, e
		}
		v.CurrentSara = rcurrentSara
	}
	if e := v.validate(); e != nil {
		return YoggSaronStateState{}, e
	}
	return YoggSaronStateState{v}, nil
}
func (s YoggSaronStateState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeYoggSaronStateState(version uint32, payload []byte) (YoggSaronStateState, error) {
	if version != YoggSaronStateStateVersion {
		return YoggSaronStateState{}, fmt.Errorf("unsupported yoggSaronState version")
	}
	var v yoggSaronStateValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return YoggSaronStateState{}, e
	}
	if e := v.validate(); e != nil {
		return YoggSaronStateState{}, e
	}
	return YoggSaronStateState{v}, nil
}
func (v yoggSaronStateValue) validate() error {
	if v.Phase < 1 || v.Phase > 3 {
		return fmt.Errorf("invalid phase")
	}
	if v.Characters == nil {
		return fmt.Errorf("missing party map")
	}
	for _, r := range v.Characters {
		if r == "" {
			return fmt.Errorf("empty party member")
		}
	}
	return nil
}
func (c *yoggSaronState) RestoreState(s YoggSaronStateState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := yoggSaronState{}
	candidate.phase = v.Phase
	candidate.phaseSource = v.PhaseSource
	candidate.characters = make(map[guid.GUID]*yoggSaronCharacter, len(v.Characters))
	for _, id := range slices.Sorted(maps.Keys(v.Characters)) {
		member, e := expansionResolve[*yoggSaronCharacter](v.Characters[id], resolve)
		if e != nil {
			return e
		}
		candidate.characters[id] = member
	}
	if v.CurrentSara != "" {
		rcurrentSara, e := expansionResolve[*yoggSaronCharacter](v.CurrentSara, resolve)
		if e != nil {
			return e
		}
		candidate.currentSara = rcurrentSara
	}
	*c = candidate
	return nil
}

const YoggSaronGuardianStateType = "wotlk.yoggSaronGuardian"
const YoggSaronGuardianStateVersion uint32 = 1

type YoggSaronGuardianState struct{ value yoggSaronGuardianValue }
type yoggSaronGuardianValue struct {
	Common string `json:"Common"`
	State  string `json:"state"`
}

func (c *yoggSaronGuardian) CaptureState(ref func(any) (string, error)) (YoggSaronGuardianState, error) {
	if c == nil || ref == nil {
		return YoggSaronGuardianState{}, fmt.Errorf("missing yoggSaronGuardian capture")
	}
	v := yoggSaronGuardianValue{}
	if c.Common == nil {
		return YoggSaronGuardianState{}, fmt.Errorf("missing yoggSaronGuardian.Common")
	}
	rCommon, e := ref(c.Common)
	if e != nil {
		return YoggSaronGuardianState{}, e
	}
	v.Common = rCommon
	if c.state == nil {
		return YoggSaronGuardianState{}, fmt.Errorf("missing yoggSaronGuardian.state")
	}
	rstate, e := ref(c.state)
	if e != nil {
		return YoggSaronGuardianState{}, e
	}
	v.State = rstate
	if e := v.validate(); e != nil {
		return YoggSaronGuardianState{}, e
	}
	return YoggSaronGuardianState{v}, nil
}
func (s YoggSaronGuardianState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeYoggSaronGuardianState(version uint32, payload []byte) (YoggSaronGuardianState, error) {
	if version != YoggSaronGuardianStateVersion {
		return YoggSaronGuardianState{}, fmt.Errorf("unsupported yoggSaronGuardian version")
	}
	var v yoggSaronGuardianValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return YoggSaronGuardianState{}, e
	}
	if e := v.validate(); e != nil {
		return YoggSaronGuardianState{}, e
	}
	return YoggSaronGuardianState{v}, nil
}
func (v yoggSaronGuardianValue) validate() error {
	if v.Common == "" {
		return fmt.Errorf("missing yoggSaronGuardian.Common reference")
	}
	if v.State == "" {
		return fmt.Errorf("missing yoggSaronGuardian.state reference")
	}
	return nil
}
func (c *yoggSaronGuardian) RestoreState(s YoggSaronGuardianState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := yoggSaronGuardian{}
	rCommon, e := expansionResolve[*characters.Common](v.Common, load)
	if e != nil {
		return e
	}
	candidate.Common = rCommon
	rstate, e := expansionResolve[*yoggSaronState](v.State, resolve)
	if e != nil {
		return e
	}
	candidate.state = rstate
	*c = candidate
	return nil
}

const LogBasedStateType = "wotlk.LogBased"
const LogBasedStateVersion uint32 = 1

type LogBasedState struct{ value LogBasedValue }
type LogBasedValue struct {
	Base        string `json:"Base"`
	Unstartable string `json:"Unstartable"`
}

func (c *LogBased) CaptureState(ref func(any) (string, error)) (LogBasedState, error) {
	if c == nil || ref == nil {
		return LogBasedState{}, fmt.Errorf("missing LogBased capture")
	}
	v := LogBasedValue{}
	if c.Base == nil {
		return LogBasedState{}, fmt.Errorf("missing LogBased.Base")
	}
	rBase, e := ref(c.Base)
	if e != nil {
		return LogBasedState{}, e
	}
	v.Base = rBase
	if c.Unstartable == nil {
		return LogBasedState{}, fmt.Errorf("missing LogBased.Unstartable")
	}
	rUnstartable, e := ref(c.Unstartable)
	if e != nil {
		return LogBasedState{}, e
	}
	v.Unstartable = rUnstartable
	if e := v.validate(); e != nil {
		return LogBasedState{}, e
	}
	return LogBasedState{v}, nil
}
func (s LogBasedState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeLogBasedState(version uint32, payload []byte) (LogBasedState, error) {
	if version != LogBasedStateVersion {
		return LogBasedState{}, fmt.Errorf("unsupported LogBased version")
	}
	var v LogBasedValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return LogBasedState{}, e
	}
	if e := v.validate(); e != nil {
		return LogBasedState{}, e
	}
	return LogBasedState{v}, nil
}
func (v LogBasedValue) validate() error {
	if v.Base == "" {
		return fmt.Errorf("missing LogBased.Base reference")
	}
	if v.Unstartable == "" {
		return fmt.Errorf("missing LogBased.Unstartable reference")
	}
	return nil
}
func (c *LogBased) RestoreState(s LogBasedState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := LogBased{}
	rBase, e := expansionResolve[*characters.Base[*period.InactivityPeriod]](v.Base, load)
	if e != nil {
		return e
	}
	candidate.Base = rBase
	rUnstartable, e := expansionResolve[*Unstartable](v.Unstartable, resolve)
	if e != nil {
		return e
	}
	candidate.Unstartable = rUnstartable
	*c = candidate
	return nil
}

const UnstartableStateType = "wotlk.Unstartable"
const UnstartableStateVersion uint32 = 1

type UnstartableState struct{ value UnstartableValue }
type UnstartableValue struct {
	CharacterBase string `json:"CharacterBase"`
}

func (c *Unstartable) CaptureState(ref func(any) (string, error)) (UnstartableState, error) {
	if c == nil || ref == nil {
		return UnstartableState{}, fmt.Errorf("missing Unstartable capture")
	}
	v := UnstartableValue{}
	if c.CharacterBase == nil {
		return UnstartableState{}, fmt.Errorf("missing Unstartable.CharacterBase")
	}
	rCharacterBase, e := ref(c.CharacterBase)
	if e != nil {
		return UnstartableState{}, e
	}
	v.CharacterBase = rCharacterBase
	if e := v.validate(); e != nil {
		return UnstartableState{}, e
	}
	return UnstartableState{v}, nil
}
func (s UnstartableState) Encode() ([]byte, error) {
	if e := s.value.validate(); e != nil {
		return nil, e
	}
	return json.Marshal(s.value)
}
func DecodeUnstartableState(version uint32, payload []byte) (UnstartableState, error) {
	if version != UnstartableStateVersion {
		return UnstartableState{}, fmt.Errorf("unsupported Unstartable version")
	}
	var v UnstartableValue
	if e := decodeExpansionValue(payload, &v); e != nil {
		return UnstartableState{}, e
	}
	if e := v.validate(); e != nil {
		return UnstartableState{}, e
	}
	return UnstartableState{v}, nil
}
func (v UnstartableValue) validate() error {
	if v.CharacterBase == "" {
		return fmt.Errorf("missing Unstartable.CharacterBase reference")
	}
	return nil
}
func (c *Unstartable) RestoreState(s UnstartableState, load, resolve func(string) (any, error)) error {
	if c == nil || load == nil || resolve == nil {
		return fmt.Errorf("missing restore dependencies")
	}
	v := s.value
	if e := v.validate(); e != nil {
		return e
	}
	candidate := Unstartable{}
	rCharacterBase, e := expansionResolve[characters.CharacterBase](v.CharacterBase, resolve)
	if e != nil {
		return e
	}
	candidate.CharacterBase = rCharacterBase
	*c = candidate
	return nil
}

func expansionResolve[T any](ref string, resolve func(string) (any, error)) (T, error) {
	var zero T
	if ref == "" {
		return zero, fmt.Errorf("empty expansion reference")
	}
	v, e := resolve(ref)
	if e != nil {
		return zero, e
	}
	typed, ok := v.(T)
	if !ok {
		return zero, fmt.Errorf("wrong expansion reference type %T", v)
	}
	return typed, nil
}
