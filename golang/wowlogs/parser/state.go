package parser

type state struct {
	// units is a map of unit names to Unit structs
	// TODO: What about units with the same name?
	units map[string]*Unit
}

func newState() *state {
	return &state{
		units: make(map[string]*Unit),
	}
}
