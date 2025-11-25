package totems

import "github.com/Emyrk/chronicle/golang/wowlogs/guid"

func IsTotem(id guid.GUID) bool {
	if id.IsPlayer() {
		return false
	}
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}

	switch entry {
	case 5879, 6110, 6111, 7844, 7845, 5929, 7464, 7465, 7466, 2523, 3902, 3904, 7400, 7402:
		return true
	}
	return false
}
