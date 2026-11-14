package synthetic

import next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla/synthetic"

// Keep pipeline wiring stable while ownership resides in parsernext Vanilla.
type razuviousOverkill = next.RazuviousOverkill

func newRazuviousOverkill() *razuviousOverkill { return next.NewRazuviousOverkill() }
