package period

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

var _ IsPeriod = (*EmptyPeriod)(nil)

type EmptyMeta struct {
	// No metadata for empty periods
}

type EmptyPeriod struct {
	*WorkingPeriod[EmptyMeta]
}

func (e EmptyPeriod) EnterResetGracePeriod(_ string, _ messages.Message) {}

func NewEmptyPeriod(me guid.GUID) *EmptyPeriod {
	return &EmptyPeriod{
		WorkingPeriod: New[EmptyMeta](me, &EmptyMeta{}),
	}
}
