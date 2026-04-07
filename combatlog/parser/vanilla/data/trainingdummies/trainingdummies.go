package trainingdummies

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

var dummies = map[uint32]struct{}{
	50514: {},
	50516: {},
	50515: {},
}

func IsTrainingDummy(id guid.GUID) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}

	_, isDummy := dummies[entry]
	return isDummy
}
