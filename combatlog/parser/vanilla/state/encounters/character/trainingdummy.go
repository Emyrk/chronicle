package character

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/trainingdummies"
)

func NewTrainingDummy(id guid.GUID, all *Characters) (Character, bool) {
	if !trainingdummies.IsTrainingDummy(id) {
		return nil, false
	}

	return NewCommonCharacter(id, all).WithTimeout(time.Second * 10).WithTimeoutAsDeath(), true
}
