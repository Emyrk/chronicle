package creatures

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const CommonOwnerStateType = "vanilla.CharacterCommonReference"
const CommonOwnerStateVersion uint32 = 1

// CommonOwnerState is the complete local state for stateless concrete characters
// that delegate activity to one canonical Common. Owner remains explicit so a
// graph cannot accidentally restore the same Common as a different behavior type.
// Each concrete type owns its RestoreState; no factory/gameplay method is called.
type CommonOwnerState struct {
	owner     string
	reference string
}

func (s CommonOwnerState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Owner     string `json:"owner"`
		Reference string `json:"reference"`
	}{s.owner, s.reference})
}
func DecodeCommonOwnerState(version uint32, payload []byte) (CommonOwnerState, error) {
	if version != CommonOwnerStateVersion {
		return CommonOwnerState{}, fmt.Errorf("unsupported concrete common owner version")
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	token, err := d.Token()
	if err != nil {
		return CommonOwnerState{}, err
	}
	if token != json.Delim('{') {
		return CommonOwnerState{}, fmt.Errorf("concrete owner must be object")
	}
	values := map[string]string{}
	for d.More() {
		token, err := d.Token()
		if err != nil {
			return CommonOwnerState{}, err
		}
		key := token.(string)
		if key != "owner" && key != "reference" {
			return CommonOwnerState{}, fmt.Errorf("unknown concrete owner field")
		}
		if _, exists := values[key]; exists {
			return CommonOwnerState{}, fmt.Errorf("duplicate concrete owner field")
		}
		var value string
		if err := d.Decode(&value); err != nil {
			return CommonOwnerState{}, err
		}
		values[key] = value
	}
	if _, err := d.Token(); err != nil {
		return CommonOwnerState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return CommonOwnerState{}, fmt.Errorf("trailing concrete owner state")
	}
	if values["owner"] == "" || values["reference"] == "" {
		return CommonOwnerState{}, fmt.Errorf("missing concrete owner/reference")
	}
	return CommonOwnerState{values["owner"], values["reference"]}, nil
}
func captureCommonOwner(owner string, c *characters.Common, capture func(*characters.Common) (string, error)) (CommonOwnerState, error) {
	if c == nil || capture == nil {
		return CommonOwnerState{}, fmt.Errorf("missing canonical common/capture")
	}
	ref, err := capture(c)
	if err != nil {
		return CommonOwnerState{}, err
	}
	if ref == "" {
		return CommonOwnerState{}, fmt.Errorf("empty common reference")
	}
	return CommonOwnerState{owner, ref}, nil
}
func (s CommonOwnerState) resolve(owner string, resolve func(string) (*characters.Common, error)) (*characters.Common, error) {
	if s.owner != owner || s.reference == "" || resolve == nil {
		return nil, fmt.Errorf("concrete owner mismatch or missing resolver")
	}
	c, err := resolve(s.reference)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, fmt.Errorf("nil canonical common")
	}
	return c, nil
}

func (c *CoreHound) CaptureState(capture func(*characters.Common) (string, error)) (CommonOwnerState, error) {
	if c == nil {
		return CommonOwnerState{}, fmt.Errorf("nil CoreHound")
	}
	return captureCommonOwner("CoreHound", c.Common, capture)
}
func (c *CoreHound) RestoreState(s CommonOwnerState, resolve func(string) (*characters.Common, error)) error {
	if c == nil {
		return fmt.Errorf("nil CoreHound destination")
	}
	common, err := s.resolve("CoreHound", resolve)
	if err != nil {
		return err
	}
	*c = CoreHound{Common: common}
	return nil
}

func (c *Onyxia) CaptureState(capture func(*characters.Common) (string, error)) (CommonOwnerState, error) {
	if c == nil {
		return CommonOwnerState{}, fmt.Errorf("nil Onyxia")
	}
	return captureCommonOwner("Onyxia", c.Common, capture)
}
func (c *Onyxia) RestoreState(s CommonOwnerState, resolve func(string) (*characters.Common, error)) error {
	if c == nil {
		return fmt.Errorf("nil Onyxia destination")
	}
	common, err := s.resolve("Onyxia", resolve)
	if err != nil {
		return err
	}
	*c = Onyxia{Common: common}
	return nil
}

func (c *DiseasedGhoul) CaptureState(capture func(*characters.Common) (string, error)) (CommonOwnerState, error) {
	if c == nil {
		return CommonOwnerState{}, fmt.Errorf("nil DiseasedGhoul")
	}
	return captureCommonOwner("DiseasedGhoul", c.Common, capture)
}
func (c *DiseasedGhoul) RestoreState(s CommonOwnerState, resolve func(string) (*characters.Common, error)) error {
	if c == nil {
		return fmt.Errorf("nil DiseasedGhoul destination")
	}
	common, err := s.resolve("DiseasedGhoul", resolve)
	if err != nil {
		return err
	}
	*c = DiseasedGhoul{Common: common}
	return nil
}

func (c *HooktoothFrenzy) CaptureState(capture func(*characters.Common) (string, error)) (CommonOwnerState, error) {
	if c == nil {
		return CommonOwnerState{}, fmt.Errorf("nil HooktoothFrenzy")
	}
	return captureCommonOwner("HooktoothFrenzy", c.Common, capture)
}
func (c *HooktoothFrenzy) RestoreState(s CommonOwnerState, resolve func(string) (*characters.Common, error)) error {
	if c == nil {
		return fmt.Errorf("nil HooktoothFrenzy destination")
	}
	common, err := s.resolve("HooktoothFrenzy", resolve)
	if err != nil {
		return err
	}
	*c = HooktoothFrenzy{Common: common}
	return nil
}
