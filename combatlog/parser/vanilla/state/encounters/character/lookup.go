package character

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character/characterset"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

type characterFactory func(id guid.GUID, chars *Characters) (Character, bool)

var characterFactories = []characterFactory{
	// Global
	NewTotemCharacter,
	NewCritterCharacter,
	NewLightwell,
	// Wailing Caverns,
	NewDiscipleOfNaralex,
	// Deadmines
	NewSneedShredder,
	NewEdwinVanCleef,
	// Dire Maul
	NewImmolthar,
	// Molten Core
	NewCoreHoundCharacter,
	NewMajordomoPartyCharacter,
	NewIncindisCharacter,
	NewSulfuronHarbingerCharacter,
	NewSmoldarisBasaltharCharacter,
	NewSorcererThaneCharacter,
	NewRagnarosCharacter,
	NewGolemaggCharacter,
	// Blackwing Lair
	NewRazorgore,
	NewShadowflameSpark,
	// Onyxia
	NewOnyxiaCharacter,
	// Zul'Gurub
	NewHighPriestArlokk,
	NewHighPriestMarli,
	NewHighPriestessJeklik,
	NewHighPriestThekalParty,
	NewJindoHexxer,
	NewHooktoothFrenzy,
	// Scholomance
	NewJandiceBarov,
	NewDiseasedGhoul,
	// Stratholme
	NewCryptScarab,
	// Timbermaw Hold
	NewKarrsh,
	NewChieftainPartath,
	NewOrmanos,
	NewUrsol,
	NewVileSkitterer,
	// AQ 40
	NewCthun,
	// Naxx,
	NewGluth,
	NewGrobbulus,
	NewAnubRekhan,
	NewThaddiusParty,
	NewGothikRoom,
	NewKelThuzadRoom,
	NewHeiganTheUnclean,
	//NewDiseasedMaggot,
	// Kara 40
	NewKruul,
	NewKing,
	NewMephistroth,
	NewDemonicEye,
	NewSanvTasDal,
	NewDraeneiNetherWalker,
	NewKeeperGnarlmoon,
	NewAnomalus,
	NewEchoOfMedivh,
	NewRupturanTheBroken,
	NewIncantagos,
	// Emerald Sanctum
	NewSolnius,
}

type SetHook interface {
	// ActivityChange is invoked every time a character's activity status changes.
	// This happens AFTER the message is processed by the character.
	ActivityChange(m messages.Message, chars ...Character)
	// CharacterAdded is invoked when a new character is added to the Characters
	// list. This happens BEFORE any messages are processed for the character, so it
	// may not have any state yet.
	CharacterAdded(m messages.Message, chars ...Character)
}

type Characters struct {
	All *characterset.Set[Character]
	// ByEntry only works on creatures
	ByEntry map[uint32][]Character
	db      *unitdb.Units

	sharedState map[string]any

	// auras keeps track of auras on all characters.
	//auras *auras.Tracking

	// TODO: unroll hooks?
	hooks []SetHook
}

func NewCharacters(db *unitdb.Units) *Characters {
	ch := &Characters{
		db:          db,
		All:         characterset.New[Character](),
		ByEntry:     make(map[uint32][]Character),
		sharedState: make(map[string]any),
	}

	return ch
}

func (c *Characters) RegisterHook(hook SetHook) {
	c.hooks = append(c.hooks, hook)
}

func (c *Characters) Save(key string, value any) {
	c.sharedState[key] = value
}

func (c *Characters) Load(key string) (any, bool) {
	val, ok := c.sharedState[key]
	return val, ok
}

func (c *Characters) Delete(key string) {
	delete(c.sharedState, key)
}

func (c Characters) Get(id guid.GUID) (Character, bool) {
	char, exists := c.All.Get(id)
	return char, exists
}

func (c Characters) GetInfo(id guid.GUID) (unitinfo.Info, bool) {
	return c.db.Get(id)
}

func (c Characters) Add(id guid.GUID, now time.Time) (_ Character, newChar bool) {
	char, exists := c.All.Get(id)
	if !exists {
		newChar = true
		for _, factory := range characterFactories {
			if specialChar, ok := factory(id, &c); ok {
				char = specialChar
				break
			}
		}

		if char == nil {
			// Just assume they are a normal character then
			char = NewCommonCharacter(id, &c)
		}

		if entry, ok := id.GetEntry(); ok {
			c.ByEntry[entry] = append(c.ByEntry[entry], char)
		}
		c.All.Add(char, now)
	}

	// Always touch the character
	c.All.Touch(char.ID(), now)
	return char, newChar
}

// TODO: Maybe a "synthetic" boolean should exist on message base. This would
// allow inserting custom messages for totems/pets that indicate their death/recall.
// This would have to be returned here to be added to the message stream.
// Idk how feasible that is though. Maybe the original processor can handle this
// for general types.
func (c Characters) Process(m messages.Message) (bool, error) {
	activityChange := c.processNewCharacters(m)

	var changed []Character
	err := c.All.ForEachAwake(m.Date(), func(char Character) error {
		before := char.IsActive()

		// TODO: Dead characters that will never return should be removed from processing?
		// Or at least have some kind of speedup
		err := char.Process(m)
		if err != nil {
			return fmt.Errorf("processing character %s: %w", char.ID().String(), err)
		}

		if before != char.IsActive() {
			changed = append(changed, char)
			// Touch each time the character changes activity status.
			c.All.Touch(char.ID(), m.Date())
		}
		return nil
	})

	// Final boolean value
	activityChange = activityChange || len(changed) > 0
	if err != nil {
		return activityChange, err
	}

	for _, hook := range c.hooks {
		hook.ActivityChange(m, changed...)
	}

	return activityChange, nil
}

// processNewCharacters adds any missing characters to the full character list.
func (c Characters) processNewCharacters(m messages.Message) bool {
	var created []Character
	// Add all affected characters to the instance's character list
	for _, id := range m.Affects() {
		if char, changed := c.Add(id, m.Date()); changed {
			created = append(created, char)
		}
	}
	if len(created) > 0 {
		for _, hook := range c.hooks {
			hook.CharacterAdded(m, created...)
		}
	}

	return len(created) > 0
}
