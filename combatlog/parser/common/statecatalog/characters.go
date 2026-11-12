package statecatalog

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/internal/stategraph"
)

const (
	TypeCharacters       = "github.com/Emyrk/chronicle/combatlog/parser/common/characters.Characters"
	TypeCharacterSet     = "github.com/Emyrk/chronicle/combatlog/parser/common/characters/characterset.Set[characters.Character]"
	TypeIdentifier       = "github.com/Emyrk/chronicle/combatlog/parser/common/identifier.Identifier"
	typeByEntryIndex     = "map[uint32][]github.com/Emyrk/chronicle/combatlog/parser/common/characters.Character"
	typeSharedState      = "map[string]any"
	typeCharacterHooks   = "[]github.com/Emyrk/chronicle/combatlog/parser/common/characters.SetHook"
	typeCharacterFactory = "[]github.com/Emyrk/chronicle/combatlog/parser/common/characters.CharacterFactory"
	typeActivityChanged  = "map[github.com/Emyrk/chronicle/combatlog/parser/common/characters.Character]struct{}"
	typeTransitions      = "[]github.com/Emyrk/chronicle/combatlog/parser/common/phases.Transition"
)

type typeSpec struct {
	path       string
	goType     string
	source     string
	base       string
	sharedWith string
	note       string
}

func addCharacterCatalog(registry *stategraph.Registry) error {
	steps := []func() error{
		func() error {
			return registry.Value("/root/instances/0000/identifier", TypeIdentifier, catalogMetadata("Hookable.Identifier", "combatlog/parser/common/instances/hookable.go", "semantic", nil))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters", TypeCharacters, catalogMetadata("Hookable.Characters", "combatlog/parser/common/characters/lookup.go", "semantic", map[string]any{"dynamic_entries": "GUID"}))
		},
		func() error {
			return registry.Reference("/root/instances/0000/characters/units", "/root/shared/units", TypeUnits, catalogMetadata("Characters.db", "combatlog/parser/common/characters/lookup.go", "shared_reference", nil))
		},
		func() error {
			return registry.Reference("/root/instances/0000/characters/identifier", "/root/instances/0000/identifier", TypeIdentifier, catalogMetadata("Characters.idf", "combatlog/parser/common/characters/lookup.go", "shared_reference", nil))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/all", TypeCharacterSet, catalogMetadata("Characters.All", "combatlog/parser/common/characters/characterset/set.go", "semantic", map[string]any{"owns": "all concrete Character values keyed by GUID"}))
		},
		func() error {
			return registry.Directory("/root/instances/0000/characters/all/entries", catalogMetadata("characterset.Set.characters", "combatlog/parser/common/characters/characterset/set.go", "dynamic", map[string]any{"key": "GUID", "value_types": "/root/character-types"}))
		},
		func() error {
			return registry.Directory("/root/instances/0000/characters/all/awake", catalogMetadata("characterset.Set.awake", "combatlog/parser/common/characters/characterset/set.go", "semantic_index", map[string]any{"key": "GUID", "state": []string{"character reference", "touchedAt", "dormantAfter"}}))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/by-entry", typeByEntryIndex, catalogMetadata("Characters.ByEntry", "combatlog/parser/common/characters/lookup.go", "derived_index", nil))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/shared-state", typeSharedState, catalogMetadata("Characters.sharedState", "combatlog/parser/common/characters/lookup.go", "semantic_polymorphic", map[string]any{"known_types": "/root/character-shared-state"}))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/staged-transitions", typeTransitions, catalogMetadata("Characters.stagedTransitions", "combatlog/parser/common/characters/lookup.go", "semantic_pending", nil))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/explicit-encounter", "bool", catalogMetadata("Characters.explicitEncounter", "combatlog/parser/common/characters/lookup.go", "semantic", nil))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/activity-changed", typeActivityChanged, catalogMetadata("Characters.activityChanged", "combatlog/parser/common/characters/lookup.go", "transient", nil))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/factories", typeCharacterFactory, catalogMetadata("Characters.factories", "combatlog/parser/common/characters/lookup.go", "runtime_dependency", map[string]any{"order_is_semantic": true}))
		},
		func() error {
			return registry.Value("/root/instances/0000/characters/hooks", typeCharacterHooks, catalogMetadata("Characters.hooks", "combatlog/parser/common/characters/lookup.go", "runtime_wiring", map[string]any{"order_is_semantic": true}))
		},
		func() error {
			return registry.Directory("/root/instances/0000/characters/callbacks", catalogMetadata("runtime callbacks", "combatlog/parser/common/characters/lookup.go", "runtime_wiring", map[string]any{"fields": []string{"noKnownParticipantsAlive", "phaseTransitionCb", "period hooks"}}))
		},
		func() error {
			return registry.Directory("/root/character-types", catalogMetadata("possible concrete Character implementations", "combatlog/parser/common/characters/character.go", "type_catalog", map[string]any{"not_runtime_instances": true}))
		},
		func() error { return registry.Directory("/root/character-types/contracts", nil) },
		func() error { return registry.Directory("/root/character-types/primitives", nil) },
		func() error { return registry.Directory("/root/character-types/common", nil) },
		func() error { return registry.Directory("/root/character-types/vanilla", nil) },
		func() error { return registry.Directory("/root/character-types/wotlk", nil) },
		func() error {
			return registry.Directory("/root/character-shared-state", catalogMetadata("known Characters.sharedState values", "combatlog/parser/common/characters/lookup.go", "type_catalog", map[string]any{"not_runtime_instances": true}))
		},
		func() error { return registry.Directory("/root/character-shared-state/common", nil) },
		func() error { return registry.Directory("/root/character-shared-state/vanilla", nil) },
		func() error { return registry.Directory("/root/character-shared-state/wotlk", nil) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return err
		}
	}

	for _, target := range []string{
		"/root/shared/units",
		"/root/instances/0000/identifier",
		"/root/instances/0000/characters/all",
		"/root/instances/0000/characters/shared-state",
	} {
		if err := registry.DependsOn("/root/instances/0000/characters", target); err != nil {
			return err
		}
	}
	if err := registry.DependsOn("/root/instances/0000", "/root/instances/0000/characters"); err != nil {
		return err
	}

	for _, spec := range characterTypeSpecs() {
		if err := registry.Directory(spec.path, catalogMetadata(spec.goType, spec.source, "character_type", map[string]any{
			"go_type": spec.goType,
			"note":    spec.note,
		})); err != nil {
			return err
		}
		if spec.base != "" {
			if err := registry.DependsOn(spec.path, spec.base); err != nil {
				return err
			}
		}
		if spec.sharedWith != "" {
			if err := registry.DependsOn(spec.path, spec.sharedWith); err != nil {
				return err
			}
		}
	}

	for _, spec := range sharedStateTypeSpecs() {
		if err := registry.Directory(spec.path, catalogMetadata(spec.goType, spec.source, "shared_character_state", map[string]any{
			"go_type": spec.goType,
			"note":    spec.note,
		})); err != nil {
			return err
		}
		if err := registry.DependsOn("/root/instances/0000/characters/shared-state", spec.path); err != nil {
			return err
		}
	}

	return nil
}

func characterTypeSpecs() []typeSpec {
	const (
		contracts  = "/root/character-types/contracts/"
		primitives = "/root/character-types/primitives/"
		common     = "/root/character-types/common/"
		vanilla    = "/root/character-types/vanilla/"
		wotlk      = "/root/character-types/wotlk/"
		commonPkg  = "github.com/Emyrk/chronicle/combatlog/parser/common/characters."
		vanillaPkg = "github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures."
		wotlkPkg   = "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures."
	)
	return []typeSpec{
		{contracts + "character", commonPkg + "Character", "combatlog/parser/common/characters/character.go", "", "", "interface contract"},
		{contracts + "character-base", commonPkg + "CharacterBase", "combatlog/parser/common/characters/common.go", contracts + "character", "", "extended lifecycle interface"},
		{primitives + "base-inactivity", commonPkg + "Base[*period.InactivityPeriod]", "combatlog/parser/common/characters/character.go", contracts + "character-base", "", "owns activity history and last slain state"},
		{primitives + "base-totem-period", commonPkg + "Base[*vanilla.TotemPeriod]", "combatlog/parser/vanilla/creatures/totem.go", contracts + "character", "", "custom totem activity period"},
		{primitives + "base-object-period", commonPkg + "Base[*vanilla.ObjectPeriod]", "combatlog/parser/vanilla/creatures/lightwell.go", contracts + "character", "", "custom object activity period"},
		{common + "common", commonPkg + "Common", "combatlog/parser/common/characters/common.go", primitives + "base-inactivity", "", "default character implementation"},
		{common + "never-active", commonPkg + "NeverActive", "combatlog/parser/common/characters/neveractive.go", contracts + "character", "", "no activity history"},
		{common + "ads-go-with-boss", commonPkg + "AdsGoWithBoss", "combatlog/parser/common/characters/adsonboss.go", contracts + "character-base", "", "wrapper around another character"},
		{common + "death-on-cast", commonPkg + "DeathOnCast", "combatlog/parser/common/characters/deathoncast.go", contracts + "character-base", "", "wrapper around another character"},
		{common + "ignore-cast", commonPkg + "IgnoreCast", "combatlog/parser/common/characters/ignorecast.go", contracts + "character-base", "", "wrapper around another character"},
		{common + "ignore-friendly-fire", commonPkg + "IgnoreFriendlyFire", "combatlog/parser/common/characters/friendlyfire.go", contracts + "character-base", "", "wrapper around another character"},
		{common + "permanent-death", commonPkg + "PermanentDeath", "combatlog/parser/common/characters/permanentdeath.go", contracts + "character-base", "", "wrapper around another character"},
		{common + "room-mechanic", commonPkg + "RoomMechanic", "combatlog/parser/common/characters/roommechanic.go", common + "common", "/root/character-shared-state/common/room", "shares room state across characters"},
		{common + "starts-new-fight", commonPkg + "StartsNewFight", "combatlog/parser/common/characters/startsnewfight.go", contracts + "character-base", "", "wrapper around another character"},
		{common + "phase-provider", commonPkg + "phaseProviderCharacter", "combatlog/parser/common/characters/phaseprovider.go", contracts + "character", "", "runtime wrapper"},
		{common + "scripted-defeat", commonPkg + "scriptedDefeatCharacter", "combatlog/parser/common/characters/scripteddefeat.go", contracts + "character", "", "runtime wrapper with defeat detector"},

		{vanilla + "bloodaxe-worg-pup", vanillaPkg + "BloodaxeWorgPup", "combatlog/parser/vanilla/creatures/spire.go", common + "common", "/root/character-shared-state/vanilla/worg-pup-captures", "VanillaPlus custom state"},
		{vanilla + "core-hound", vanillaPkg + "CoreHound", "combatlog/parser/vanilla/creatures/corehound.go", common + "common", "", ""},
		{vanilla + "critter", vanillaPkg + "Critter", "combatlog/parser/vanilla/creatures/critter.go", common + "never-active", "", ""},
		{vanilla + "cthun-party", vanillaPkg + "CthunParty", "combatlog/parser/vanilla/creatures/anhqiraj.go", common + "common", "/root/character-shared-state/vanilla/cthun", "C'Thun eye and body coordinate through shared state"},
		{vanilla + "disciple-of-naralex", vanillaPkg + "DiscipleOfNaralex", "combatlog/parser/vanilla/creatures/wailingcaverns.go", common + "never-active", "", ""},
		{vanilla + "diseased-ghoul", vanillaPkg + "DiseasedGhoul", "combatlog/parser/vanilla/creatures/scholomance.go", common + "common", "", ""},
		{vanilla + "fragment-of-rupturan", vanillaPkg + "FragmentOfRupturan", "combatlog/parser/vanilla/creatures/rupturan.go", common + "common", "", ""},
		{vanilla + "high-priest-thekal-party", vanillaPkg + "HighPriestThekalParty", "combatlog/parser/vanilla/creatures/zulgurub.go", common + "common", "", ""},
		{vanilla + "hooktooth-frenzy", vanillaPkg + "HooktoothFrenzy", "combatlog/parser/vanilla/creatures/zulgurub.go", common + "common", "", ""},
		{vanilla + "majordomo-party", vanillaPkg + "MajordomoParty", "combatlog/parser/vanilla/creatures/majordomo.go", common + "common", "", ""},
		{vanilla + "object", vanillaPkg + "Object", "combatlog/parser/vanilla/creatures/lightwell.go", primitives + "base-object-period", "", "custom object period"},
		{vanilla + "onyxia", vanillaPkg + "Onyxia", "combatlog/parser/vanilla/creatures/onyxia.go", common + "common", "", ""},
		{vanilla + "razor-ad", vanillaPkg + "RazorAdCharacter", "combatlog/parser/vanilla/creatures/bwl.go", common + "common", "", ""},
		{vanilla + "sneed-shredder", vanillaPkg + "SneedShredder", "combatlog/parser/vanilla/creatures/deadmines.go", common + "common", "", ""},
		{vanilla + "thaddius-party", vanillaPkg + "ThaddiusParty", "combatlog/parser/vanilla/creatures/naxx.go", common + "common", "", ""},
		{vanilla + "totem", vanillaPkg + "Totem", "combatlog/parser/vanilla/creatures/totem.go", primitives + "base-totem-period", "", "custom totem period"},
		{vanilla + "archmage-arugal", vanillaPkg + "archmageArugal", "combatlog/parser/vanilla/creatures/sfk.go", contracts + "character-base", "", "wraps a selected base character"},
		{vanilla + "broodlord-lashlayer", vanillaPkg + "broodlordLashlayer", "combatlog/parser/vanilla/creatures/bwl.go", common + "starts-new-fight", "", ""},
		{vanilla + "core-rager", vanillaPkg + "coreRager", "combatlog/parser/vanilla/creatures/moltencore.go", common + "common", "", ""},
		{vanilla + "kel-thuzad", vanillaPkg + "kelThuzad", "combatlog/parser/vanilla/creatures/naxx.go", common + "permanent-death", "", ""},
		{vanilla + "nefarian", vanillaPkg + "nefarian", "combatlog/parser/vanilla/creatures/bwl.go", common + "room-mechanic", "/root/character-shared-state/common/room", ""},
		{vanilla + "razorgore", vanillaPkg + "razorgore", "combatlog/parser/vanilla/creatures/bwl.go", common + "common", "", ""},
		{vanilla + "shadowflame-spark", vanillaPkg + "shadowflameSpark", "combatlog/parser/vanilla/creatures/bwl.go", common + "common", "", ""},
		{vanilla + "son-of-the-flame", vanillaPkg + "sonOfTheFlameCharacter", "combatlog/parser/vanilla/creatures/moltencore.go", common + "common", "", ""},
		{vanilla + "vanilla-plus-mograine", vanillaPkg + "vanillaPlusMograineCharacter", "combatlog/parser/vanilla/creatures/sm.go", common + "common", "", ""},

		{wotlk + "log-based", wotlkPkg + "LogBased", "combatlog/parser/wotlk/creatures/logbased.go", primitives + "base-inactivity", "", "server-side log character"},
		{wotlk + "unstartable", wotlkPkg + "Unstartable", "combatlog/parser/wotlk/creatures/logbased.go", contracts + "character-base", "", "wrapper used by LogBased"},
		{wotlk + "algalon", wotlkPkg + "algalonCharacter", "combatlog/parser/wotlk/creatures/algalon.go", common + "common", "", ""},
		{wotlk + "assembly-of-iron", wotlkPkg + "assemblyOfIronCharacter", "combatlog/parser/wotlk/creatures/assemblyofiron.go", common + "common", "", ""},
		{wotlk + "attumen-the-huntsman", wotlkPkg + "attumenTheHuntsman", "combatlog/parser/wotlk/creatures/karazhan.go", common + "common", "", ""},
		{wotlk + "coilfang-guardian", wotlkPkg + "coilfangGuardian", "combatlog/parser/wotlk/creatures/serpentshrinecavern.go", common + "common", "", ""},
		{wotlk + "freya", wotlkPkg + "freyaCharacter", "combatlog/parser/wotlk/creatures/freya.go", common + "common", "", ""},
		{wotlk + "gunship-battle", wotlkPkg + "gunshipBattleCharacter", "combatlog/parser/wotlk/creatures/icecrowncitadel.go", common + "common", "/root/instances/0000/characters", "Common owns activity, six-minute timeout and recently-slain suppression; all is a shared Characters reference used to end linked crew on positive-overkill victory; no additional mutable scalar state"},
		{wotlk + "halion", wotlkPkg + "halionCharacter", "combatlog/parser/wotlk/creatures/rubysanctum.go", common + "common", "/root/instances/0000/characters", "NewHalionCharacter creates the owner; Common owns activity and recently-slain suppression; all is a shared Characters reference used to end linked physical and twilight bodies on death; no additional mutable scalar state; catalog description does not imply a restore adapter"},
		{wotlk + "hodir", wotlkPkg + "hodirCharacter", "combatlog/parser/wotlk/creatures/hodir.go", common + "common", "", ""},
		{wotlk + "kael-thas", wotlkPkg + "kaelThasCharacter", "combatlog/parser/wotlk/creatures/kaelthas.go", common + "room-mechanic", "/root/character-shared-state/wotlk/kael-thas", ""},
		{wotlk + "kologarn", wotlkPkg + "kologarnCharacter", "combatlog/parser/wotlk/creatures/kologarn.go", common + "common", "", ""},
		{wotlk + "lady-deathwhisper", wotlkPkg + "ladyDeathwhisperCharacter", "combatlog/parser/wotlk/creatures/icecrowncitadel.go", common + "common", "/root/instances/0000/characters", "phaseTwo bool is semantic per-fight state reset on activation; all is a shared Characters reference used to emit phase transitions; phase definitions are static policy"},
		{wotlk + "lich-king", wotlkPkg + "lichKingCharacter", "combatlog/parser/wotlk/creatures/icecrowncitadel.go", common + "common", "/root/instances/0000/characters", "phase int is semantic per-fight state reset to 1 on activation and 0 when inactive; all is a shared Characters reference used to emit phase transitions; phase definitions are static policy"},
		{wotlk + "malygos-phase-two-add", wotlkPkg + "malygosPhaseTwoAdd", "combatlog/parser/wotlk/creatures/eyeofeternity.go", common + "common", "", ""},
		{wotlk + "mimiron", wotlkPkg + "mimironCharacter", "combatlog/parser/wotlk/creatures/mimiron.go", common + "common", "/root/character-shared-state/wotlk/mimiron", ""},
		{wotlk + "professor-putricide", wotlkPkg + "professorPutricideCharacter", "combatlog/parser/wotlk/creatures/icecrowncitadel.go", common + "common", "/root/instances/0000/characters", "phase int is semantic per-fight state reset to 1 on activation and 0 when inactive; all is a shared Characters reference used to emit phase transitions; phase definitions are static policy"},
		{wotlk + "razorscale-add", wotlkPkg + "razorscaleAdd", "combatlog/parser/wotlk/creatures/razorscale.go", common + "common", "", ""},
		{wotlk + "reliquary", wotlkPkg + "reliquaryCharacter", "combatlog/parser/wotlk/creatures/reliquary.go", common + "room-mechanic", "/root/character-shared-state/wotlk/reliquary", "TBC encounter currently implemented in the legacy wotlk package; embeds RoomMechanic with a two-minute pending-death window; all is a shared Characters reference and state aliases the shared tbc_reliquary value"},
		{wotlk + "sindragosa", wotlkPkg + "sindragosaCharacter", "combatlog/parser/wotlk/creatures/icecrowncitadel.go", common + "common", "/root/instances/0000/characters", "finalPhase bool is semantic per-fight state reset on activation; all is a shared Characters reference used to emit phase transitions; phase definitions are static policy"},
		{wotlk + "thorim", wotlkPkg + "thorimCharacter", "combatlog/parser/wotlk/creatures/thorim.go", common + "room-mechanic", "/root/character-shared-state/wotlk/thorim", ""},
		{wotlk + "valithria-dreamwalker", wotlkPkg + "valithriaDreamwalkerCharacter", "combatlog/parser/wotlk/creatures/icecrowncitadel.go", common + "common", "/root/instances/0000/characters", "Common owns activity and recently-slain suppression; all is a shared Characters reference used to end linked adds on Dreamwalker's Rage positive-overkill victory; no additional mutable scalar state"},
		{wotlk + "yogg-saron", wotlkPkg + "yoggSaronCharacter", "combatlog/parser/wotlk/creatures/yoggsaron.go", common + "common", "/root/character-shared-state/wotlk/yogg-saron", ""},
		{wotlk + "yogg-saron-guardian", wotlkPkg + "yoggSaronGuardian", "combatlog/parser/wotlk/creatures/yoggsaron.go", common + "common", "/root/character-shared-state/wotlk/yogg-saron", ""},
	}
}

func sharedStateTypeSpecs() []typeSpec {
	return []typeSpec{
		{"/root/character-shared-state/common/room", "github.com/Emyrk/chronicle/combatlog/parser/common/characters.Room", "combatlog/parser/common/characters/roommechanic.go", "", "", "maps GUIDs to RoomMechanic and tracks the boss"},
		{"/root/character-shared-state/vanilla/cthun", "github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures.CthunParty", "combatlog/parser/vanilla/creatures/anhqiraj.go", "", "", "eye instance stored for body coordination"},
		{"/root/character-shared-state/vanilla/worg-pup-captures", "github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures.worgPupCaptures", "combatlog/parser/vanilla/creatures/spire.go", "", "", "capture count and last touched time"},
		{"/root/character-shared-state/wotlk/mimiron", "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures.mimironState", "combatlog/parser/wotlk/creatures/mimiron.go", "", "", "phase, source, character map, and phase-four component state"},
		{"/root/character-shared-state/wotlk/reliquary", "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures.reliquaryState", "combatlog/parser/wotlk/creatures/reliquary.go", "", "", "stored under Characters.sharedState key tbc_reliquary; semantic phase int and phaseSource GUID, plus characters map[GUID]*reliquaryCharacter preserving aliases to owned character instances; phase definitions are static policy"},
		{"/root/character-shared-state/wotlk/thorim", "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures.thorimState", "combatlog/parser/wotlk/creatures/thorim.go", "", "", "phase, source, and character map"},
		{"/root/character-shared-state/wotlk/kael-thas", "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures.kaelThasState", "combatlog/parser/wotlk/creatures/kaelthas.go", "", "", "phase, source, weapon death state, and character map"},
		{"/root/character-shared-state/wotlk/yogg-saron", "github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures.yoggSaronState", "combatlog/parser/wotlk/creatures/yoggsaron.go", "", "", "phase, source, current Sara, and character map"},
	}
}

func catalogMetadata(label, source, classification string, extra map[string]any) json.RawMessage {
	data := map[string]any{
		"label":          label,
		"source":         source,
		"classification": classification,
	}
	for key, value := range extra {
		data[key] = value
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		panic(fmt.Sprintf("marshal static character catalog metadata: %v", err))
	}
	return encoded
}
