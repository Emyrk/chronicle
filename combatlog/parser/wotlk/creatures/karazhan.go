package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	attumenUnmountedEntry = 15550
	midnightEntry         = 16151
	attumenMountedEntry   = 16152
)

type attumenTheHuntsman struct {
	*characters.Common
	all *characters.Characters
}

func NewAttumenTheHuntsman(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != attumenMountedEntry {
		return nil, false
	}

	attumen := &attumenTheHuntsman{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}

	return characters.NewAdsGoWithBossCustomCharacter(
		attumen,
		all,
		attumenMountedEntry,
		attumenUnmountedEntry,
		midnightEntry,
	), true
}

// Process ensures common activity dispatches through attumenTheHuntsman so its
// Start and Bump overrides can keep the earlier forms active.
func (a *attumenTheHuntsman) Process(m messages.Message) error {
	cur, ok := a.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	return characters.ProcessCommonActivity(a, m)
}

func (a *attumenTheHuntsman) Start(reason string, m messages.Message) {
	a.Common.Start(reason, m)
	a.bumpEarlierForms(m)
}

func (a *attumenTheHuntsman) Bump(reason string, m messages.Message) {
	a.Common.Bump(reason, m)
	a.bumpEarlierForms(m)
}

func (a *attumenTheHuntsman) bumpEarlierForms(m messages.Message) {
	for _, entry := range []uint32{attumenUnmountedEntry, midnightEntry} {
		for _, earlierForm := range a.all.ByEntry[entry] {
			if earlierForm, ok := earlierForm.(characters.CharacterBase); ok && earlierForm.IsActive() {
				earlierForm.Bump("mounted_attumen_activity", m)
			}
		}
	}
}
