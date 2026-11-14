package instances

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type versionsGraphValue struct {
	Base      messages.MessageBaseState `json:"base"`
	Player    *guid.GUID                `json:"player"`
	Versions  map[string]string         `json:"versions"`
	SessionID string                    `json:"session_id"`
}

// RegisterMetadataGraphOwners is included by RegisterHookableGraphOwner. Metadata
// headers shared with parse-wide state remain canonical, including their maps.
func RegisterMetadataGraphOwners(r *ownergraph.Registry) error {
	if err := ownergraph.Register(r, ownergraph.Codec[realm.Info]{Type: "metadata.realm", Version: 1, Init: func() *realm.Info { return new(realm.Info) }, Capture: func(v *realm.Info, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(v) }, Restore: func(v *realm.Info, n uint32, b []byte, _ *ownergraph.Restore) error {
		if n != 1 {
			return fmt.Errorf("unsupported realm version")
		}
		return decodeLeafValue(b, v)
	}}); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[messages.Versions]{Type: "metadata.versions", Version: 1, Init: func() *messages.Versions { return new(messages.Versions) }, Capture: func(v *messages.Versions, _ *ownergraph.Capture) ([]byte, error) {
		return json.Marshal(versionsGraphValue{v.CaptureState(), v.Player, v.Versions, v.SessionID})
	}, Restore: func(v *messages.Versions, n uint32, b []byte, _ *ownergraph.Restore) error {
		if n != 1 {
			return fmt.Errorf("unsupported versions version")
		}
		var state versionsGraphValue
		if err := decodeLeafValue(b, &state); err != nil {
			return err
		}
		*v = messages.Versions{MessageBase: state.Base.Restore(), Player: state.Player, Versions: state.Versions, SessionID: state.SessionID}
		return nil
	}})
}

func (h *Hookable) GraphMetadata() (*realm.Info, *messages.Versions) {
	return h.realm, h.graphVersionsMessage
}
