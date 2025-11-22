package whoami

import (
	"fmt"

	"github.com/Emyrk/chronicle/golang/wowlogs/types"
)

type Me struct {
	Unit *types.Unit
}

func NewMe() *Me {
	return &Me{}
}

func (m *Me) SetUnit(unit types.Unit) error {
	if m.Unit != nil {
		if m.Unit.Gid != unit.Gid {
			return fmt.Errorf("conflicting Me unit GIDs: existing %s, new %s", m.Unit.Gid.String(), unit.Gid.String())
		}
		return nil
	}

	m.Unit = &unit
	return nil
}
