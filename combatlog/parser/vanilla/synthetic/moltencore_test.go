package synthetic

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/castv2"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

const ragGUID guid.GUID = 0xF130002CEE000001
const lavaGUID guid.GUID = 0xF11002B7A8000001
const flameGUID guid.GUID = 0xF13000335C000001

var hazardTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func hazardPipeline(t *testing.T, flavor database.WoWFlavor) (*Synthetic, func(...messages.Message)) {
	t.Helper()
	s := New(parsectx.With(t.Context(), parsectx.Context{Flavor: flavor}), slog.Default(), nil)
	return s, func(msgs ...messages.Message) {
		t.Helper()
		out, err := s.ProcessMessages(msgs)
		require.NoError(t, err)
		require.Len(t, out, len(msgs))
	}
}

func hazardZone(name string) *messages.Zone {
	return &messages.Zone{MessageBase: messages.Base(hazardTime), Zone: zone.Zone{Name: name}}
}
func hazardBoss(id guid.GUID) *messages.Unit {
	return &messages.Unit{MessageBase: messages.Base(hazardTime), Info: unitinfo.Info{Guid: id}}
}
func hazardDamage(source guid.GUID, at time.Time) *messages.Damage {
	name := "Lava Burst"
	return &messages.Damage{MessageBase: messages.Base(at), Caster: &source, Target: 1, Amount: 317, SpellName: &name, SpellID: 21158, SpellData: &chrondbc.Spell{ID: 21158}}
}

func TestMoltenCoreHazardAttribution(t *testing.T) {
	t.Parallel()
	for _, source := range []guid.GUID{lavaGUID, flameGUID} {
		t.Run(source.String(), func(t *testing.T) {
			t.Parallel()
			_, process := hazardPipeline(t, database.WoWFlavor{database.FlavorTurtle})
			process(hazardZone("Molten Core"))
			unseen := hazardDamage(source, hazardTime)
			process(unseen)
			require.Equal(t, source, *unseen.Caster)
			for _, id := range []guid.GUID{source, 1} {
				_, ignored := unseen.MarkHas(messages.MarkTypeIgnoreActivity, id)
				require.True(t, ignored)
			}
			process(hazardBoss(ragGUID))
			damage := hazardDamage(source, hazardTime)
			spell := damage.SpellData
			originalCaster := damage.Caster
			process(damage)
			require.Equal(t, ragGUID, *damage.Caster)
			require.Equal(t, source, *originalCaster)
			require.Equal(t, int32(317), damage.Amount)
			require.Equal(t, "Lava Burst", *damage.SpellName)
			require.Equal(t, chrondbc.SpellID(21158), damage.SpellID)
			require.Same(t, spell, damage.SpellData)
			for _, id := range []guid.GUID{source, ragGUID, 1} {
				_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, id)
				require.True(t, ignored)
			}
			target := guid.GUID(1)
			goEvent := &messages.SpellGo{MessageBase: messages.Base(hazardTime), Caster: source, Target: &target, SpellID: 21158}
			start := &messages.SpellStart{MessageBase: messages.Base(hazardTime), Caster: source, Target: &target, SpellID: 21158}
			//nolint:staticcheck // Exercise the legacy CAST v2 path as well.
			legacy := &messages.Cast{MessageBase: messages.Base(hazardTime), CastV2: castv2.CastV2{Caster: types.Unit{Gid: source}, Target: &types.Unit{Gid: target}}}
			process(goEvent, start, legacy)
			require.Equal(t, ragGUID, goEvent.Caster)
			require.Equal(t, ragGUID, start.Caster)
			require.Equal(t, ragGUID, legacy.Caster.Gid)
			for _, event := range []messages.Message{goEvent, start, legacy} {
				for _, id := range []guid.GUID{source, ragGUID, target} {
					_, ignored := event.MarkHas(messages.MarkTypeIgnoreActivity, id)
					require.True(t, ignored)
				}
			}
		})
	}
}

func TestMoltenCoreHazardScopeAndBoundaries(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorTurtle}, {database.FlavorVanilla}, {database.FlavorVanillaPlus}} {
		for _, area := range []string{"Molten Core", "Blackwing Lair"} {
			_, process := hazardPipeline(t, flavor)
			process(hazardZone(area), hazardBoss(ragGUID))
			for _, source := range []guid.GUID{lavaGUID, flameGUID, 0xF13002B7A8000001, 0xF11000335C000001, 0xF14000335C000001, ragGUID} {
				damage := hazardDamage(source, hazardTime)
				process(damage)
				expected := flavor.Has(database.FlavorTurtle) && area == "Molten Core" && (source == lavaGUID || source == flameGUID)
				_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, damage.Target)
				require.Equal(t, expected, ignored)
				if expected {
					require.Equal(t, ragGUID, *damage.Caster)
				} else {
					require.Equal(t, source, *damage.Caster)
				}
			}
		}
	}
	_, process := hazardPipeline(t, database.WoWFlavor{database.FlavorTurtle})
	for _, boundary := range []messages.Message{hazardZone("Blackwing Lair"), &messages.Versions{MessageBase: messages.Base(hazardTime)}, &messages.Realm{MessageBase: messages.Base(hazardTime)}, &messages.EncounterBoundary{MessageBase: messages.Base(hazardTime)}, &messages.UnitEvade{MessageBase: messages.Base(hazardTime), UnitGUID: ragGUID}} {
		process(hazardZone("Blackwing Lair"), hazardZone("Molten Core"), hazardBoss(ragGUID), boundary)
		damage := hazardDamage(lavaGUID, hazardTime)
		process(damage)
		require.Equal(t, lavaGUID, *damage.Caster)
	}
	process(hazardZone("Molten Core"), hazardBoss(ragGUID), hazardBoss(ragGUID+1))
	damage := hazardDamage(lavaGUID, hazardTime)
	process(damage)
	require.Equal(t, ragGUID+1, *damage.Caster)
	// Direct events are sufficient to observe a respawn without UNIT_INFO.
	process(hazardDamage(ragGUID+2, hazardTime))
	damage = hazardDamage(lavaGUID, hazardTime)
	process(damage)
	require.Equal(t, ragGUID+2, *damage.Caster)
	// Object and pet entry collisions must never replace the observed creature.
	process(hazardBoss(0xF110002CEE000002), hazardBoss(0xF140002CEE000002))
	damage = hazardDamage(lavaGUID, hazardTime)
	process(damage)
	require.Equal(t, ragGUID+2, *damage.Caster)
}

func TestMoltenCoreHazardsNeverCreateOrExtendActivity(t *testing.T) {
	t.Parallel()
	for _, observed := range []bool{false, true} {
		for _, source := range []guid.GUID{lavaGUID, flameGUID} {
			_, process := hazardPipeline(t, database.WoWFlavor{database.FlavorTurtle})
			process(hazardZone("Molten Core"))
			chars := characters.NewCharacters(unitdb.New(database.WoWFlavor{database.FlavorTurtle}), []characters.CharacterFactory{creatures.NewRagnarosCharacter}, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
			if observed {
				process(hazardBoss(ragGUID))
			}
			for _, id := range []guid.GUID{ragGUID, source, 1} {
				chars.Add(id, hazardTime)
			}
			apply := func(m messages.Message) {
				t.Helper()
				process(m)
				_, err := chars.Process(m)
				require.NoError(t, err)
			}
			apply(hazardDamage(source, hazardTime))
			for _, id := range []guid.GUID{ragGUID, source, 1} {
				c, _ := chars.Get(id)
				require.False(t, c.IsActive())
			}
			// Real boss damage still starts both boss and player.
			apply(hazardDamage(ragGUID, hazardTime.Add(time.Second)))
			for _, id := range []guid.GUID{ragGUID, 1} {
				c, _ := chars.Get(id)
				require.True(t, c.IsActive())
			}
			// Independently active helpers must not be extended either.
			player := guid.GUID(1)
			apply(&messages.Damage{MessageBase: messages.Base(hazardTime.Add(time.Second)), Caster: &player, Target: source, Amount: 1})
			helper, _ := chars.Get(source)
			require.True(t, helper.IsActive())
			apply(hazardDamage(source, hazardTime.Add(30*time.Second)))
			_, err := chars.Process(messages.TimedOut(hazardTime.Add(70 * time.Second)))
			require.NoError(t, err)
			for _, id := range []guid.GUID{ragGUID, source, 1} {
				c, _ := chars.Get(id)
				require.False(t, c.IsActive())
			}
			apply(&messages.Slain{MessageBase: messages.Base(hazardTime.Add(71 * time.Second)), Victim: ragGUID})
			apply(&messages.Slain{MessageBase: messages.Base(hazardTime.Add(71 * time.Second)), Victim: 1})
			// Well beyond recently-slain protection, hazards still cannot reopen a fight.
			apply(hazardDamage(source, hazardTime.Add(120*time.Second)))
			apply(&messages.SpellStart{MessageBase: messages.Base(hazardTime.Add(121 * time.Second)), Caster: source, Target: &player, SpellID: 21158})
			apply(&messages.SpellGo{MessageBase: messages.Base(hazardTime.Add(122 * time.Second)), Caster: source, Target: &player, SpellID: 21158})
			for _, id := range []guid.GUID{ragGUID, source, 1} {
				c, _ := chars.Get(id)
				require.False(t, c.IsActive())
			}
		}
	}
}
