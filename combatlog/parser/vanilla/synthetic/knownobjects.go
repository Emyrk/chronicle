package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/traps"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type knownObjects struct {
}

func newKnownObjects() *knownObjects {
	return &knownObjects{}
}

func (s *knownObjects) ProcessMessages(msgs []messages.Message) []messages.Message {
	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.Unit:
			if m.Guid.IsObject() {
				if appendMsgs := s.objectSeen(m); len(appendMsgs) > 0 {
					add = append(add, appendMsgs...)
				}
			}
		}
	}

	return append(msgs, add...)
}

func (s *knownObjects) objectSeen(m *messages.Unit) []messages.Message {
	entry, ok := m.Guid.GetEntry()
	if !ok {
		return nil
	}

	_, isTrap := traps.IsTrap(m.Guid)
	switch {
	case entry == 181102, isTrap:
		// Lightwell & traps have the owner in the charm field.
		if m.Owner == nil && m.Charm != nil {
			m.Owner = m.Charm
			// A unit classification event will be emitted from this NewOwner
			return []messages.Message{&messages.NewOwner{
				MessageBase: messages.Base(m.Date()),
				Target:      m.Guid,
				NewOwner:    *m.Charm,
			}}
		}
	}
	return nil
}
