package creatures

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type creatureGraphValue struct {
	State json.RawMessage `json:"state"`
	All   string          `json:"all"`
}

// RegisterGraphOwners registers explicit owner-local codecs without replaying factories.
func RegisterGraphOwners(r *ownergraph.Registry) error {
	registrations := []func() error{
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[kelThuzad]{Type: KelThuzadStateType, Version: KelThuzadStateVersion, Init: func() *kelThuzad { return new(kelThuzad) },
				Capture: (*kelThuzad).captureGraphState, Restore: (*kelThuzad).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[vanillaPlusMograineCharacter]{Type: VanillaPlusMograineStateType, Version: VanillaPlusMograineStateVersion, Init: func() *vanillaPlusMograineCharacter { return new(vanillaPlusMograineCharacter) },
				Capture: (*vanillaPlusMograineCharacter).captureGraphState, Restore: (*vanillaPlusMograineCharacter).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[worgPupCaptures]{Type: WorgPupCapturesStateType, Version: WorgPupCapturesStateVersion, Init: func() *worgPupCaptures { return new(worgPupCaptures) },
				Capture: (*worgPupCaptures).captureGraphState, Restore: (*worgPupCaptures).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[BloodaxeWorgPup]{Type: "vanilla.BloodaxeWorgPup", Version: CommonOwnerStateVersion, Init: func() *BloodaxeWorgPup { return new(BloodaxeWorgPup) },
				Capture: (*BloodaxeWorgPup).captureGraphState, Restore: (*BloodaxeWorgPup).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[ThaddiusParty]{Type: ThaddiusPartyStateType, Version: ThaddiusPartyStateVersion, Init: func() *ThaddiusParty { return new(ThaddiusParty) },
				Capture: (*ThaddiusParty).captureGraphState, Restore: (*ThaddiusParty).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Totem]{Type: TotemStateType, Version: TotemStateVersion, Init: func() *Totem { return new(Totem) },
				Capture: (*Totem).captureGraphState, Restore: (*Totem).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Object]{Type: ObjectStateType, Version: ObjectStateVersion, Init: func() *Object { return new(Object) },
				Capture: (*Object).captureGraphState, Restore: (*Object).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Critter]{Type: CritterStateType, Version: CritterStateVersion, Init: func() *Critter { return new(Critter) },
				Capture: (*Critter).captureGraphState, Restore: (*Critter).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[DiscipleOfNaralex]{Type: DiscipleOfNaralexStateType, Version: DiscipleOfNaralexStateVersion, Init: func() *DiscipleOfNaralex { return new(DiscipleOfNaralex) },
				Capture: (*DiscipleOfNaralex).captureGraphState, Restore: (*DiscipleOfNaralex).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[archmageArugal]{Type: ArchmageArugalStateType, Version: ArchmageArugalStateVersion, Init: func() *archmageArugal { return new(archmageArugal) },
				Capture: (*archmageArugal).captureGraphState, Restore: (*archmageArugal).restoreGraphState, Validate: func(c *archmageArugal) error {
					if _, ok := c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }); !ok {
						return fmt.Errorf("unsupported Arugal period owner")
					}
					return nil
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[CoreHound]{Type: "vanilla.CoreHound", Version: CommonOwnerStateVersion, Init: func() *CoreHound { return new(CoreHound) },
				Capture: (*CoreHound).captureGraphState, Restore: (*CoreHound).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Onyxia]{Type: "vanilla.Onyxia", Version: CommonOwnerStateVersion, Init: func() *Onyxia { return new(Onyxia) },
				Capture: (*Onyxia).captureGraphState, Restore: (*Onyxia).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[DiseasedGhoul]{Type: "vanilla.DiseasedGhoul", Version: CommonOwnerStateVersion, Init: func() *DiseasedGhoul { return new(DiseasedGhoul) },
				Capture: (*DiseasedGhoul).captureGraphState, Restore: (*DiseasedGhoul).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[HooktoothFrenzy]{Type: "vanilla.HooktoothFrenzy", Version: CommonOwnerStateVersion, Init: func() *HooktoothFrenzy { return new(HooktoothFrenzy) },
				Capture: (*HooktoothFrenzy).captureGraphState, Restore: (*HooktoothFrenzy).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[coreRager]{Type: "vanilla.coreRager", Version: CommonOwnerStateVersion, Init: func() *coreRager { return new(coreRager) },
				Capture: (*coreRager).captureGraphState, Restore: (*coreRager).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[sonOfTheFlameCharacter]{Type: "vanilla.sonOfTheFlameCharacter", Version: CommonOwnerStateVersion, Init: func() *sonOfTheFlameCharacter { return new(sonOfTheFlameCharacter) },
				Capture: (*sonOfTheFlameCharacter).captureGraphState, Restore: (*sonOfTheFlameCharacter).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[RazorAdCharacter]{Type: "vanilla.RazorAdCharacter", Version: CommonOwnerStateVersion, Init: func() *RazorAdCharacter { return new(RazorAdCharacter) },
				Capture: (*RazorAdCharacter).captureGraphState, Restore: (*RazorAdCharacter).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[FragmentOfRupturan]{Type: "vanilla.FragmentOfRupturan", Version: CommonOwnerStateVersion, Init: func() *FragmentOfRupturan { return new(FragmentOfRupturan) },
				Capture: (*FragmentOfRupturan).captureGraphState, Restore: (*FragmentOfRupturan).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[MajordomoParty]{Type: MajordomoPartyStateType, Version: MajordomoPartyStateVersion, Init: func() *MajordomoParty { return new(MajordomoParty) },
				Capture: (*MajordomoParty).captureGraphState, Restore: (*MajordomoParty).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[broodlordLashlayer]{Type: BroodlordLashlayerStateType, Version: BroodlordLashlayerStateVersion, Init: func() *broodlordLashlayer { return new(broodlordLashlayer) },
				Capture: (*broodlordLashlayer).captureGraphState, Restore: (*broodlordLashlayer).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[razorgore]{Type: RazorgoreStateType, Version: RazorgoreStateVersion, Init: func() *razorgore { return new(razorgore) },
				Capture: (*razorgore).captureGraphState, Restore: (*razorgore).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[shadowflameSpark]{Type: ShadowflameSparkStateType, Version: ShadowflameSparkStateVersion, Init: func() *shadowflameSpark { return new(shadowflameSpark) },
				Capture: (*shadowflameSpark).captureGraphState, Restore: (*shadowflameSpark).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[TotemPeriod]{Type: TotemPeriodStateType, Version: TotemPeriodStateVersion, Init: func() *TotemPeriod { return new(TotemPeriod) },
				Capture: (*TotemPeriod).captureGraphState, Restore: (*TotemPeriod).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[ObjectPeriod]{Type: ObjectPeriodStateType, Version: ObjectPeriodStateVersion, Init: func() *ObjectPeriod { return new(ObjectPeriod) },
				Capture: (*ObjectPeriod).captureGraphState, Restore: (*ObjectPeriod).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[HighPriestThekalParty]{Type: HighPriestThekalPartyStateType, Version: HighPriestThekalPartyStateVersion, Init: func() *HighPriestThekalParty { return new(HighPriestThekalParty) },
				Capture: (*HighPriestThekalParty).captureGraphState, Restore: (*HighPriestThekalParty).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[SneedShredder]{Type: SneedShredderStateType, Version: SneedShredderStateVersion, Init: func() *SneedShredder { return new(SneedShredder) },
				Capture: (*SneedShredder).captureGraphState, Restore: (*SneedShredder).restoreGraphState})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[CthunParty]{Type: CthunPartyStateType, Version: CthunPartyStateVersion, Init: func() *CthunParty { return new(CthunParty) },
				Capture: (*CthunParty).captureGraphState, Restore: (*CthunParty).restoreGraphState})
		},
		func() error { return RegisterNefarianGraphOwner(r) },
		func() error { return characters.RegisterBaseGraphOwner[*TotemPeriod](r, "vanilla.Base.Totem") },
		func() error { return characters.RegisterBaseGraphOwner[*ObjectPeriod](r, "vanilla.Base.Object") },
	}
	for _, register := range registrations {
		if e := register(); e != nil {
			return e
		}
	}
	return nil
}

func (c *archmageArugal) WireGraphPeriodHook(h period.Hook) {
	c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }).WireGraphPeriodHook(h)
}
