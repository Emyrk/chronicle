package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

const (
	rupturanEntry           = 59961
	fragmentOfRupturanEntry = 59957
)

var _ characters.CharacterBase = (*FragmentOfRupturan)(nil)

type FragmentOfRupturan struct {
	*characters.Common
	all *characters.Characters
}

func NewFragmentOfRupturan(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != fragmentOfRupturanEntry {
		return nil, false
	}

	return characters.NewAdsGoWithBossCustomCharacter(&FragmentOfRupturan{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, all, fragmentOfRupturanEntry,
		59901, // Felheart
	), true
}

func (f *FragmentOfRupturan) Process(m messages.Message) error {
	// Timeouts should be checked on every timestamp
	cur, ok := f.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	return characters.ProcessCommonActivity(f, m)
}

func (f *FragmentOfRupturan) Bump(reason string, m messages.Message) {
	boss, ok := f.all.ByEntry[rupturanEntry]
	if ok {
		for _, b := range boss {
			isRupt, ok := b.(*characters.AdsGoWithBoss)
			if ok {
				isRupt.Bump("fragment_"+reason, m)
			}
		}
	}
	f.Common.Bump(reason, m)
}

// Felhearts are strange, and should just be seen as dead
func NewFelheart(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 59901 {
		return nil, false
	}

	return characters.NewCommonCharacter(id, all).WithTimeoutAsDeath(), true
}

// RupturanTheBroken handles the two-phase Rupturan encounter.
// Phase 1: Rupturan alive with Crumbling Exiles and Living Stones.
// Phase 2: Rupturan dies → 3 Fragment of Rupturan spawn. Encounter ends when all die.
//
// Rupturan's death happens if add 3 fragments are killed successfully.
func NewRupturanTheBroken(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(rupturanEntry,
		59901, // Felhear
	)(id, all)
}
