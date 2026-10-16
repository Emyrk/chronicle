package chroniclesdk

// MapControls are a user's replay map camera keybinds.
type MapControls struct {
	// Bindings maps a camera action (e.g. "move_forward") to a
	// KeyboardEvent.code (e.g. "KeyW"). Actions left out use the default key.
	// Empty when the user has not changed the defaults.
	Bindings map[string]string `json:"bindings"`
}
