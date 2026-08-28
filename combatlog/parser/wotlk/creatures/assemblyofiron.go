package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const assemblyRespawnDetectionGap = 5 * time.Second

var assemblyOfIronEntries = map[uint32]struct{}{
	32857: {}, // Stormcaller Brundir
	32867: {}, // Steelbreaker
	32927: {}, // Runemaster Molgeim
}

type assemblyOfIronCharacter struct {
	*characters.Common
	all   *characters.Characters
	entry uint32
}

func NewAssemblyOfIronCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := assemblyOfIronEntries[entry]; !ok {
		return nil, false
	}

	return &assemblyOfIronCharacter{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
		entry:  entry,
	}, true
}

// Process calls ProcessCommonActivity with the wrapper so Start dynamically
// dispatches to the Assembly reset handling below.
func (c *assemblyOfIronCharacter) Process(m messages.Message) error {
	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	return characters.ProcessCommonActivity(c, m)
}

func (c *assemblyOfIronCharacter) Start(reason string, m messages.Message) {
	if !c.IsActive() && c.isRespawnDuringPreviousAssembly(m) {
		// Do not start the respawned member on the same message. Ending the old
		// council first lets fight detection finalize the previous pull; the next
		// council activity starts the new encounter.
		c.resetPreviousAssembly(m)
		return
	}
	c.Common.Start(reason, m)
}

func (c *assemblyOfIronCharacter) isRespawnDuringPreviousAssembly(m messages.Message) bool {
	previousSpawnExists := false
	for _, candidate := range c.all.ByEntry[c.entry] {
		if candidate.ID() != c.ID() && len(candidate.Periods()) > 0 {
			previousSpawnExists = true
			break
		}
	}
	if !previousSpawnExists {
		return false
	}

	for entry := range assemblyOfIronEntries {
		for _, candidate := range c.all.ByEntry[entry] {
			current, ok := candidate.CurrentPeriod()
			if candidate.ID() != c.ID() && candidate.IsActive() && ok && current.Start != nil &&
				m.Date().Sub(current.Start.Timestamp.Date()) >= assemblyRespawnDetectionGap {
				return true
			}
		}
	}
	return false
}

func (c *assemblyOfIronCharacter) resetPreviousAssembly(m messages.Message) {
	for entry := range assemblyOfIronEntries {
		for _, candidate := range c.all.ByEntry[entry] {
			if candidate.ID() == c.ID() || !candidate.IsActive() {
				continue
			}
			if character, ok := candidate.(characters.CharacterBase); ok {
				character.End("assembly_new_spawn", m, period.EndStateReset)
			}
		}
	}
}
