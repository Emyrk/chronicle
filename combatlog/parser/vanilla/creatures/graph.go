package creatures

import "github.com/Emyrk/chronicle/internal/stategraph/ownergraph"

// RegisterNefarianGraphOwner is the explicit adapter for the bounded Nefarian
// character graph. Other concrete owners remain unsupported until registered.
func RegisterNefarianGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[nefarian]{Type: NefarianStateType, Version: NefarianStateVersion, Init: InitNefarian, Capture: (*nefarian).captureGraphState, Restore: (*nefarian).restoreGraphState})
}
