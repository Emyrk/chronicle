package synthetic

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	unitInfoCooldown = time.Minute * 10
)

type unitInfo struct {
	ctx           context.Context
	logger        *slog.Logger
	lastEmit      map[guid.GUID]time.Time
	creatures     gamedb.CreatureFetcher
	names         NameResolver
	spells        gamedb.SpellFetcher
	detectedClass map[guid.GUID]types.HeroClasses
	// knownCombatants tracks player GUIDs for which we've received a real
	// Combatant message (e.g. from the companion addon or CHRONICLE_COMBATANT_INFO).
	// The synthetic layer stops emitting anything for these players — both
	// spell-based class detection and periodic combatant re-emission.
	knownCombatants map[guid.GUID]struct{}
}

func newUnitInfo(ctx context.Context, logger *slog.Logger, fetcher gamedb.CreatureFetcher, names NameResolver, spells gamedb.SpellFetcher) *unitInfo {
	return &unitInfo{
		ctx:             ctx,
		logger:          logger,
		lastEmit:        make(map[guid.GUID]time.Time),
		creatures:       fetcher,
		names:           names,
		spells:          spells,
		detectedClass:   make(map[guid.GUID]types.HeroClasses),
		knownCombatants: make(map[guid.GUID]struct{}),
	}
}

// spellClassSetToHeroClass converts a DBC SpellClassSet to a HeroClasses enum value.
func spellClassSetToHeroClass(cs chrondbc.SpellClassSet) types.HeroClasses {
	switch cs {
	case chrondbc.SpellClassSetMage:
		return types.HeroClassesMAGE
	case chrondbc.SpellClassSetWarrior:
		return types.HeroClassesWARRIOR
	case chrondbc.SpellClassSetWarlock:
		return types.HeroClassesWARLOCK
	case chrondbc.SpellClassSetPriest:
		return types.HeroClassesPRIEST
	case chrondbc.SpellClassSetDruid:
		return types.HeroClassesDRUID
	case chrondbc.SpellClassSetRogue:
		return types.HeroClassesROGUE
	case chrondbc.SpellClassSetHunter:
		return types.HeroClassesHUNTER
	case chrondbc.SpellClassSetPaladin:
		return types.HeroClassesPALADIN
	case chrondbc.SpellClassSetShaman:
		return types.HeroClassesSHAMAN
	case chrondbc.SpellClassSetDeathKnight:
		return types.HeroClassesDEATHKNIGHT
	default:
		return types.HeroClassesUNKNOWN
	}
}

// detectClassFromSpell attempts to determine the class of a player from the spell
// they cast. If the spell's SpellClassSet is class-specific (non-generic), it maps
// to a HeroClasses value and caches it. Returns true if a new class was detected.
func (z *unitInfo) detectClassFromSpell(sourceGUID guid.GUID, spell *chrondbc.Spell) bool {
	if spell == nil {
		return false
	}
	for i := range spell.Effect {
		// Skip effects that make items. Heathstone and other clickable creates confuse
		// class detection.
		if spell.Effect[i] == chrondbc.EffectCreateItem {
			return false
		}
	}

	if _, ok := z.detectedClass[sourceGUID]; ok {
		return false // already detected
	}
	heroClass := spellClassSetToHeroClass(spell.SpellClassSet)
	if heroClass == types.HeroClassesUNKNOWN {
		return false
	}
	z.detectedClass[sourceGUID] = heroClass

	name := "unknown"
	if n, ok := z.names.Get(sourceGUID); ok {
		name = n
	}
	z.logger.Info("detected player class from spell",
		slog.String("player", name),
		slog.String("guid", sourceGUID.String()),
		slog.String("class", string(heroClass)),
		slog.Int("spell_id", int(spell.ID)),
		slog.String("spell_name", spell.String()),
		slog.String("spell_class_set", spell.SpellClassSet.String()),
	)
	return true
}

// extractSpellSource returns the caster GUID and spell data from a message.
// Only SpellGo events are used for class detection — they represent confirmed
// spell casts and avoid false positives from reflected/proc damage or auras
// applied by other sources.
func extractSpellSource(msg messages.Message) (guid.GUID, *chrondbc.Spell) {
	switch m := msg.(type) {
	case *messages.SpellGo:
		if m.Caster.IsPlayer() {
			return m.Caster, m.SpellData
		}
	}
	return 0, nil
}

func (z *unitInfo) classForPlayer(g guid.GUID) types.HeroClasses {
	if c, ok := z.detectedClass[g]; ok {
		return c
	}
	return types.HeroClassesUNKNOWN
}

func (z *unitInfo) ProcessMessages(msgs []messages.Message) []messages.Message {
	// Pass 0: record GUIDs from real Combatant messages (e.g. companion addon or
	// CHRONICLE_COMBATANT_INFO). Once we have authoritative data for a player the
	// synthetic layer should not emit anything for that GUID — no spell-based class
	// detection, no periodic re-emission.
	for _, msg := range msgs {
		if c, ok := msg.(*messages.Combatant); ok && c.Guid.IsPlayer() {
			z.knownCombatants[c.Guid] = struct{}{}
			if c.HeroClass != "" && c.HeroClass != types.HeroClassesUNKNOWN {
				z.detectedClass[c.Guid] = c.HeroClass
			}
		}
	}

	// First pass: detect classes from spell events before emitting combatant messages.
	// This way, if a player's first appearance includes a spell, we can immediately
	// enrich the combatant info with the detected class.
	// Skip players that already have a real Combatant message.
	var newlyDetected map[guid.GUID]struct{}
	for _, msg := range msgs {
		sourceGUID, spell := extractSpellSource(msg)
		if sourceGUID != 0 && spell != nil {
			if _, known := z.knownCombatants[sourceGUID]; known {
				continue
			}
			if z.detectClassFromSpell(sourceGUID, spell) {
				if newlyDetected == nil {
					newlyDetected = make(map[guid.GUID]struct{})
				}
				newlyDetected[sourceGUID] = struct{}{}
			}
		}
	}

	// Re-emit combatant info for players whose class was just detected, even if
	// they are still within the 10-minute cooldown window. This ensures downstream
	// consumers receive the enriched class data promptly.
	var add []messages.Message
	if len(newlyDetected) > 0 {
		for g := range newlyDetected {
			// Only re-emit if already emitted once (i.e. within cooldown).
			if _, emittedBefore := z.lastEmit[g]; emittedBefore {
				name, ok := z.names.Get(g)
				if !ok {
					continue
				}
				ts := msgs[0].Date()
				add = append(add, &messages.Combatant{
					MessageBase: messages.Base(ts),
					Combatant: combatant.Combatant{
						Name:      name,
						Guid:      g,
						Seen:      ts,
						HeroClass: z.classForPlayer(g),
						Gender:    types.HeroGenderUnknown,
						Race:      types.HeroRacesUnknown,
					},
				})
			}
		}
	}

	for _, msg := range msgs {
		for _, c := range msg.Affects() {
			if !z.check(c, msg.Date()) {
				continue
			}

			if c.IsPlayer() {
				// Skip players with real Combatant data — the companion addon
				// or server already provides authoritative info for them.
				if _, known := z.knownCombatants[c]; known {
					continue
				}
				name, ok := z.names.Get(c)
				if !ok {
					continue
				}
				add = append(add, &messages.Combatant{
					MessageBase: messages.Base(msg.Date()),
					Combatant: combatant.Combatant{
						Name:       name,
						Guid:       c,
						Seen:       msg.Date(),
						HeroClass:  z.classForPlayer(c),
						Gender:     types.HeroGenderUnknown,
						Race:       types.HeroRacesUnknown,
						PetName:    "",
						Guild:      nil,
						GearSetups: nil,
						Talents:    nil,
					},
				})
				continue
			}

			entry, ok := c.GetEntry()
			if !ok {
				continue
			}

			name, ok := z.names.Get(c)
			if !ok {
				cre, ok := z.creatures.Creature(int32(entry))
				if !ok {
					continue
				}
				name = cre.Name
			}

			add = append(add, &messages.Unit{
				MessageBase: messages.Base(msg.Date()),
				Info: unitinfo.Info{
					Seen:         msg.Date(),
					Guid:         c,
					IsPlayer:     false,
					Name:         name,
					CanCooperate: false,
					Owner:        nil,
				},
			})
		}
	}

	if len(add) > 0 {
		return append(add, msgs...)
	}
	return msgs
}

func (c *unitInfo) check(guid guid.GUID, now time.Time) bool {
	if last, ok := c.lastEmit[guid]; ok {
		if now.Sub(last) < unitInfoCooldown {
			return false
		}
	}

	c.lastEmit[guid] = now
	return true
}
