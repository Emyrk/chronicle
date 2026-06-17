package traps

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

type Trap struct {
	ID   uint32
	Name string
}

func IsTrap(id guid.GUID) (*Trap, bool) {
	if id.IsPlayer() {
		return nil, false
	}
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	trap, exists := trapMap[entry]
	return trap, exists
}

var trapMap = map[uint32]*Trap{}

func init() {
	register("Explosive Trap", 164839, 164879, 164880)
	register("Immolation Trap", 164638, 164872, 164873, 164874, 164875)
	register("Freezing Trap", 2561, 164876, 164877)
	register("Frost Trap", 164639)
}

func register(name string, ids ...uint32) {
	for _, id := range ids {
		trapMap[id] = &Trap{ID: id, Name: name}
	}
}
