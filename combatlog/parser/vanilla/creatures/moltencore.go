package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	ragnarosEntry = 11502
)

func NewRagnarosCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if entry != ragnarosEntry {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.SetRecentlySlainDuration(time.Second * 15)
	return c, true
}

const (
	sulfuronHarbinger = 12098
	sonOfFlame        = 12143
	lavaSpawn         = 12265
)

// sonOfTheFlameCharacter propagates activity from Sons of Flame to
// Ragnaros during his submerge phase, preventing the boss from timing
// out while adds are still being fought.
type sonOfTheFlameCharacter struct {
	*characters.Common
	all *characters.Characters
}

// NewSonOfTheFlameCharacter creates a character wrapper for Son of Flame
// (entry 12143) that forwards every activity event to the active Ragnaros.
func NewSonOfTheFlameCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != sonOfFlame {
		return nil, false
	}

	return &sonOfTheFlameCharacter{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

// Process overrides Common.Process so that ProcessCommonActivity receives
// the wrapper as the CharacterBase receiver, enabling dynamic dispatch to
// our Start/Bump overrides.
func (s *sonOfTheFlameCharacter) Process(m messages.Message) error {
	cur, ok := s.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	return characters.ProcessCommonActivity(s, m)
}

// Start delegates to Common.Start, then bumps Ragnaros. Direct damage
// routes through Start rather than Bump, so both must propagate.
func (s *sonOfTheFlameCharacter) Start(reason string, m messages.Message) {
	s.Common.Start(reason, m)
	s.bumpRagnaros(m)
}

// Bump extends the Son's activity period and also bumps Ragnaros.
// Periodic damage and mark bumps route through here.
func (s *sonOfTheFlameCharacter) Bump(reason string, m messages.Message) {
	s.Common.Bump(reason, m)
	s.bumpRagnaros(m)
}

// bumpRagnaros refreshes the timeout of any currently active Ragnaros.
// It never starts a new period — only bumps an existing active one.
func (s *sonOfTheFlameCharacter) bumpRagnaros(m messages.Message) {
	for _, rag := range s.all.ByEntry[ragnarosEntry] {
		ragBase, ok := rag.(characters.CharacterBase)
		if ok && ragBase.IsActive() {
			ragBase.Bump("son_of_flame_activity", m)
		}
	}
}

func NewSulfuronHarbingerCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(sulfuronHarbinger, sonOfFlame, lavaSpawn)(id, all)
}

const (
	sorcererThane        = 57642
	imageOfSorcererThane = 57643
)

func NewSorcererThaneCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(sorcererThane, imageOfSorcererThane)(id, all)
}

const (
	incindis          = 52145
	spawnOfIncindis   = 52148
	flameskinIncindis = 52149
	eggIncindis       = 52146
)

func NewIncindisCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	c, ok := characters.NewAdsGoWithBoss(incindis, spawnOfIncindis, flameskinIncindis, eggIncindis)(id, all)
	if !ok {
		return nil, false
	}

	return characters.NewIgnoreCastCharacter(c, 42038), true
}

type coreRager struct {
	*characters.Common
}

func (c *coreRager) Process(m messages.Message) error {
	if ty, ok := m.(*messages.AuraCast); ok {
		// Spell is called 'Golemagg's Trust'. It is periodically called
		if ty.Spell != nil && ty.Spell.ID == 20553 {
			if (ty.Target != nil && *ty.Target == c.ID()) ||
				ty.Caster == c.ID() {
				ty.MarkActivityStart("trust spell with golemagg", c.ID())
			}
		}
	}

	err := c.Common.Process(m)
	if err != nil {
		return err
	}
	return nil
}

func NewCoreRager(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 11672 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	return &coreRager{c}, true
}

func NewGolemaggCharacter(flavor database.WoWFlavor) func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
		c, ok := characters.NewAdsGoWithBoss(11988,
			// The Core Rager does have a death log in most cases, however apparently not in
			// every case. Their life is tied to Golemagg, so this patch, althought not
			// necessary, is going to be added.
			11672, // Core Rager
		)(id, all)
		if !ok {
			return nil, false
		}

		if flavor.Has(database.FlavorVanillaPlus) {
			// This spell sometimes affects after death.
			return characters.NewIgnoreCastCharacter(c, 34481), true
		}

		return c, true
	}

}
