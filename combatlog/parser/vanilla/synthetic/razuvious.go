package synthetic

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type razuviousOverkill struct {
	lastSlain time.Time
	raz       guid.GUID
}

func newRazuviousOverkill() *razuviousOverkill {
	return &razuviousOverkill{}
}

func (r *razuviousOverkill) ProcessMessages(msg []messages.Message) {
	for _, m := range msg {
		switch ty := m.(type) {
		case *messages.Slain:
			entry, ok := ty.Victim.GetEntry()
			if !ok || entry != 16061 {
				continue
			}

			r.lastSlain = ty.Timestamp
			r.raz = ty.Victim
		case *messages.Damage:
			if r.raz == 0 {
				continue
			}

			if r.raz != 0 && m.Date().Sub(r.lastSlain) > time.Minute {
				// Stop processing raz overkills
				r.raz = 0
				r.lastSlain = time.Time{}
				continue
			}

			entry, ok := ty.Target.GetEntry()
			if !ok {
				continue
			}

			if entry != 16803 {
				continue
			}

			if ty.Amount > 10000 {
				ty.Synthetic = true
				ty.Amount = 1
			}
		}
	}
}
