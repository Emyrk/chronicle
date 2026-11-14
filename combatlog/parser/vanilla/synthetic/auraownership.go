package synthetic

import next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla/synthetic"

// Compatibility names retain the existing pipeline wiring; the algorithm and
// its owned state live in parsernext's Vanilla module.
type auraOwnership = next.AuraOwnership

func newAuraOwnership() *auraOwnership { return next.NewAuraOwnership() }
