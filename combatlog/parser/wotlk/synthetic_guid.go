package wotlk

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
)

func syntheticGUID(id guid.GUID) guid.GUID { return cleu.SyntheticGUID(id) }
