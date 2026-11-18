package unitdb

import "github.com/Emyrk/chronicle/combatlog/parser/common/messages"

// MessageHasCategory checks the affected combat participants, not incidental
// identities referenced by metadata. It does not filter or discard the event.
func (us *Units) MessageHasCategory(m messages.Message, category Category, identifiers ...CategoryIdentifier) bool {
	for _, id := range m.Affects() {
		if us.Category(id, identifiers...) == category {
			return true
		}
	}
	return false
}
