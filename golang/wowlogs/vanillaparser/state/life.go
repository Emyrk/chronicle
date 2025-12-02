package state

import (
	"errors"

	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
)

type Lives struct {
	Alive        []Life
	LastActivity messages.Message
}

type Life struct {
	Start messages.Message
	End   messages.Message
}

func NewLives(m messages.Message) Lives {
	return Lives{
		Alive:        make([]Life, 0),
		LastActivity: m,
	}
}

func (l *Lives) Bump(m messages.Message) {
	l.LastActivity = m
}

func (l *Lives) EndLife(m messages.Message) {
	if len(l.Alive) == 0 {
		return
	}
	l.Alive[len(l.Alive)-1].End = m
}

func (l *Lives) StartLife(m messages.Message) error {
	if l.IsActive() {
		return errors.New("Life already active")
	}
	l.Alive = append(l.Alive, Life{
		Start: m,
		End:   nil,
	})
	return nil
}

func (l *Lives) LastInactiveMessage() messages.Message {
	if len(l.Alive) == 0 {
		return nil
	}
	return l.Alive[len(l.Alive)-1].End
}

// IsActive returns if the unit is currently known to be alive.
func (l Lives) IsActive() bool {
	if len(l.Alive) == 0 {
		return false
	}

	return l.Alive[len(l.Alive)-1].End == nil
}
