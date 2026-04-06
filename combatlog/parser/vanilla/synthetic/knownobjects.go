package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
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

	switch entry {
	case 181102:
		// Lightwell has the owner in the charm field.
		if m.Info.Owner == nil && m.Info.Charm != nil {
			m.Info.Owner = m.Info.Charm
			// A unit classification event will be emitted from this NewOwner
			return []messages.Message{&messages.NewOwner{
				MessageBase: messages.Base(m.Date()),
				Target:      m.Guid,
				NewOwner:    *m.Info.Charm,
			}}
		}
	}
	return nil
}
