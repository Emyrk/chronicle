package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var razorscaleBossEntries = []uint32{33186, 33724}

var razorscaleAddEntries = map[uint32]struct{}{
	33388: {}, // Dark Rune Guardian
	33453: {}, // Dark Rune Watcher
	33846: {}, // Dark Rune Sentinel
}

type razorscaleAdd struct {
	*characters.Common
	all *characters.Characters
}

func NewRazorscaleAdd(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := razorscaleAddEntries[entry]; !ok {
		return nil, false
	}

	return &razorscaleAdd{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

// Process calls ProcessCommonActivity with the wrapper so Start and Bump
// dynamically dispatch to the Razorscale activity hooks below.
func (c *razorscaleAdd) Process(m messages.Message) error {
	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	return characters.ProcessCommonActivity(c, m)
}

func (c *razorscaleAdd) Start(reason string, m messages.Message) {
	c.Common.Start(reason, m)
	c.bumpRazorscale(m)
}

func (c *razorscaleAdd) Bump(reason string, m messages.Message) {
	c.Common.Bump(reason, m)
	c.bumpRazorscale(m)
}

func (c *razorscaleAdd) bumpRazorscale(m messages.Message) {
	for _, entry := range razorscaleBossEntries {
		for _, candidate := range c.all.ByEntry[entry] {
			boss, ok := candidate.(characters.CharacterBase)
			if ok && boss.IsActive() {
				boss.Bump("razorscale_add_activity", m)
			}
		}
	}
}
