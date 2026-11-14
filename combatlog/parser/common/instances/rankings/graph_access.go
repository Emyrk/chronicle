package rankings

import "github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"

// GraphUnits exposes the canonical dependency for component-root validation.
func (t *DPSTracker) GraphUnits() *unitdb.Units { return t.units }
