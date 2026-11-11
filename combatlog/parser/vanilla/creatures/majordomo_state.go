package creatures

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"reflect"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const MajordomoPartyStateType = "vanilla.MajordomoParty"
const MajordomoPartyStateVersion uint32 = 1

// MajordomoPartyState owns local flags and references only. Party members and
// Common are canonical graph objects, never reconstructed or announced here.
type MajordomoPartyState struct{ value majordomoPartyValue }
type majordomoPartyValue struct {
	Common      string               `json:"common"`
	IsMajordomo bool                 `json:"is_majordomo"`
	Announced   bool                 `json:"announced"`
	Party       map[guid.GUID]string `json:"party"`
}

func (c *MajordomoParty) CaptureState(common func(*characters.Common) (string, error), member func(characters.Character) (string, error)) (MajordomoPartyState, error) {
	if c == nil || c.all == nil {
		return MajordomoPartyState{}, fmt.Errorf("missing MajordomoParty/dependency")
	}
	base, err := captureCommonOwner("MajordomoParty", c.Common, common)
	if err != nil {
		return MajordomoPartyState{}, err
	}
	v := majordomoPartyValue{Common: base.reference, IsMajordomo: c.isMajordomo, Announced: c.announced}
	if c.party != nil {
		v.Party = make(map[guid.GUID]string, len(c.party))
	}
	for id, ch := range c.party {
		if nilPartyMember(ch) || member == nil {
			return MajordomoPartyState{}, fmt.Errorf("missing party member/capture")
		}
		ref, err := member(ch)
		if err != nil {
			return MajordomoPartyState{}, err
		}
		if ref == "" {
			return MajordomoPartyState{}, fmt.Errorf("empty party reference")
		}
		v.Party[id] = ref
	}
	return MajordomoPartyState{v}, nil
}
func (s MajordomoPartyState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeMajordomoPartyState(version uint32, payload []byte) (MajordomoPartyState, error) {
	if version != MajordomoPartyStateVersion {
		return MajordomoPartyState{}, fmt.Errorf("unsupported MajordomoParty version")
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	var v majordomoPartyValue
	if err := d.Decode(&v); err != nil {
		return MajordomoPartyState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return MajordomoPartyState{}, fmt.Errorf("trailing MajordomoParty state")
	}
	if v.Common == "" {
		return MajordomoPartyState{}, fmt.Errorf("empty common reference")
	}
	for _, ref := range v.Party {
		if ref == "" {
			return MajordomoPartyState{}, fmt.Errorf("empty party reference")
		}
	}
	return MajordomoPartyState{v}, nil
}

// RestoreState only assigns local state after every reference resolves. It does
// not inspect ByEntry, announce members, end periods, or publish into all.
func (c *MajordomoParty) RestoreState(s MajordomoPartyState, all *characters.Characters, common func(string) (*characters.Common, error), member func(string) (characters.Character, error)) error {
	if c == nil || all == nil {
		return fmt.Errorf("missing MajordomoParty destination/dependency")
	}
	base, err := (CommonOwnerState{owner: "MajordomoParty", reference: s.value.Common}).resolve("MajordomoParty", common)
	if err != nil {
		return err
	}
	var party map[guid.GUID]characters.Character
	if s.value.Party != nil {
		party = make(map[guid.GUID]characters.Character, len(s.value.Party))
	}
	for id, ref := range s.value.Party {
		if ref == "" || member == nil {
			return fmt.Errorf("missing party reference/resolver")
		}
		ch, err := member(ref)
		if err != nil {
			return err
		}
		if nilPartyMember(ch) {
			return fmt.Errorf("nil party member")
		}
		party[id] = ch
	}
	*c = MajordomoParty{Common: base, all: all, isMajordomo: s.value.IsMajordomo, announced: s.value.Announced, party: party}
	return nil
}

// Only detects typed nil dependencies; no reflection-based serialization.
func nilPartyMember(c characters.Character) bool {
	v := reflect.ValueOf(c)
	return !v.IsValid() || (v.Kind() == reflect.Pointer && v.IsNil())
}
