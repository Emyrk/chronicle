package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var _ Character = (*NeverActive)(nil)

// NeverActive should not have any meaningful activity, so this is a no-op implementation.
type NeverActive struct {
	id guid.GUID
}

func NewNeverActive(id guid.GUID) NeverActive {
	return NeverActive{id: id}
}

// NewNamedNeverActive creates a character that never contributes activity while
// preserving its known display name in instance unit metadata.
func NewNamedNeverActive(id guid.GUID, all *Characters, name string) NeverActive {
	all.DB().UpdateUnitName(id, name)
	return NewNeverActive(id)
}

func (c NeverActive) ID() guid.GUID {
	return c.id
}
func (c NeverActive) SetPeriodHook(hook period.Hook) {}
func (c NeverActive) String() string {
	return "never_active"
}
func (c NeverActive) Process(m messages.Message) error {
	return nil
}
func (c NeverActive) Died(reason string, m messages.Message) {}
func (c NeverActive) Periods() []period.Period {
	return []period.Period{}
}
func (c NeverActive) CurrentPeriod() (period.Period, bool) {
	return period.Period{}, false
}
func (c NeverActive) RecentlySlain(m messages.Message) bool {
	return false
}
func (c NeverActive) IsActive() bool {
	return false
}
func (c NeverActive) LastEndState() period.EndState {
	return period.EndStateNone
}
