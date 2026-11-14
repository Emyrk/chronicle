package creatures

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
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
				Capture: func(c *kelThuzad, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.PermanentDeath](ctx), ownergraph.Reference[*characters.RoomMechanic](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *kelThuzad, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeKelThuzadState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.PermanentDeath](ctx), ownergraph.Loader[*characters.RoomMechanic](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[vanillaPlusMograineCharacter]{Type: VanillaPlusMograineStateType, Version: VanillaPlusMograineStateVersion, Init: func() *vanillaPlusMograineCharacter { return new(vanillaPlusMograineCharacter) },
				Capture: func(c *vanillaPlusMograineCharacter, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *vanillaPlusMograineCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeVanillaPlusMograineState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[worgPupCaptures]{Type: WorgPupCapturesStateType, Version: WorgPupCapturesStateVersion, Init: func() *worgPupCaptures { return new(worgPupCaptures) },
				Capture: func(c *worgPupCaptures, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState()
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *worgPupCaptures, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeWorgPupCapturesState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s)
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[BloodaxeWorgPup]{Type: "vanilla.BloodaxeWorgPup", Version: CommonOwnerStateVersion, Init: func() *BloodaxeWorgPup { return new(BloodaxeWorgPup) },
				Capture: func(c *BloodaxeWorgPup, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *BloodaxeWorgPup, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[ThaddiusParty]{Type: ThaddiusPartyStateType, Version: ThaddiusPartyStateVersion, Init: func() *ThaddiusParty { return new(ThaddiusParty) },
				Capture: func(c *ThaddiusParty, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx), ownergraph.Reference[messages.Message](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *ThaddiusParty, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeThaddiusPartyState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx), ownergraph.Loader[messages.Message](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Totem]{Type: TotemStateType, Version: TotemStateVersion, Init: func() *Totem { return new(Totem) },
				Capture: func(c *Totem, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Base[*TotemPeriod]](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *Totem, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeTotemState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Base[*TotemPeriod]](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Object]{Type: ObjectStateType, Version: ObjectStateVersion, Init: func() *Object { return new(Object) },
				Capture: func(c *Object, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Base[*ObjectPeriod]](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *Object, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeObjectState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Base[*ObjectPeriod]](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Critter]{Type: CritterStateType, Version: CritterStateVersion, Init: func() *Critter { return new(Critter) },
				Capture: func(c *Critter, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState()
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *Critter, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeCritterState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s)
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[DiscipleOfNaralex]{Type: DiscipleOfNaralexStateType, Version: DiscipleOfNaralexStateVersion, Init: func() *DiscipleOfNaralex { return new(DiscipleOfNaralex) },
				Capture: func(c *DiscipleOfNaralex, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState()
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *DiscipleOfNaralex, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeDiscipleOfNaralexState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s)
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[archmageArugal]{Type: ArchmageArugalStateType, Version: ArchmageArugalStateVersion, Init: func() *archmageArugal { return new(archmageArugal) },
				Capture: func(c *archmageArugal, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[characters.CharacterBase](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *archmageArugal, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeArchmageArugalState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[characters.CharacterBase](ctx))
				}, Validate: func(c *archmageArugal) error {
					if _, ok := c.CharacterBase.(interface{ WireGraphPeriodHook(period.Hook) }); !ok {
						return fmt.Errorf("unsupported Arugal period owner")
					}
					return nil
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[CoreHound]{Type: "vanilla.CoreHound", Version: CommonOwnerStateVersion, Init: func() *CoreHound { return new(CoreHound) },
				Capture: func(c *CoreHound, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *CoreHound, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[Onyxia]{Type: "vanilla.Onyxia", Version: CommonOwnerStateVersion, Init: func() *Onyxia { return new(Onyxia) },
				Capture: func(c *Onyxia, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *Onyxia, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[DiseasedGhoul]{Type: "vanilla.DiseasedGhoul", Version: CommonOwnerStateVersion, Init: func() *DiseasedGhoul { return new(DiseasedGhoul) },
				Capture: func(c *DiseasedGhoul, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *DiseasedGhoul, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[HooktoothFrenzy]{Type: "vanilla.HooktoothFrenzy", Version: CommonOwnerStateVersion, Init: func() *HooktoothFrenzy { return new(HooktoothFrenzy) },
				Capture: func(c *HooktoothFrenzy, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *HooktoothFrenzy, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[coreRager]{Type: "vanilla.coreRager", Version: CommonOwnerStateVersion, Init: func() *coreRager { return new(coreRager) },
				Capture: func(c *coreRager, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(c *coreRager, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[sonOfTheFlameCharacter]{Type: "vanilla.sonOfTheFlameCharacter", Version: CommonOwnerStateVersion, Init: func() *sonOfTheFlameCharacter { return new(sonOfTheFlameCharacter) },
				Capture: func(c *sonOfTheFlameCharacter, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *sonOfTheFlameCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[RazorAdCharacter]{Type: "vanilla.RazorAdCharacter", Version: CommonOwnerStateVersion, Init: func() *RazorAdCharacter { return new(RazorAdCharacter) },
				Capture: func(c *RazorAdCharacter, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *RazorAdCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[FragmentOfRupturan]{Type: "vanilla.FragmentOfRupturan", Version: CommonOwnerStateVersion, Init: func() *FragmentOfRupturan { return new(FragmentOfRupturan) },
				Capture: func(c *FragmentOfRupturan, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *FragmentOfRupturan, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeCommonOwnerState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[MajordomoParty]{Type: MajordomoPartyStateType, Version: MajordomoPartyStateVersion, Init: func() *MajordomoParty { return new(MajordomoParty) },
				Capture: func(c *MajordomoParty, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx), ownergraph.Reference[characters.Character](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *MajordomoParty, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeMajordomoPartyState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx), ownergraph.Loader[characters.Character](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[broodlordLashlayer]{Type: BroodlordLashlayerStateType, Version: BroodlordLashlayerStateVersion, Init: func() *broodlordLashlayer { return new(broodlordLashlayer) },
				Capture: func(c *broodlordLashlayer, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.StartsNewFight](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *broodlordLashlayer, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeBroodlordLashlayerState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.StartsNewFight](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[razorgore]{Type: RazorgoreStateType, Version: RazorgoreStateVersion, Init: func() *razorgore { return new(razorgore) },
				Capture: func(c *razorgore, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *razorgore, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeRazorgoreState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[shadowflameSpark]{Type: ShadowflameSparkStateType, Version: ShadowflameSparkStateVersion, Init: func() *shadowflameSpark { return new(shadowflameSpark) },
				Capture: func(c *shadowflameSpark, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *shadowflameSpark, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeShadowflameSparkState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[TotemPeriod]{Type: TotemPeriodStateType, Version: TotemPeriodStateVersion, Init: func() *TotemPeriod { return new(TotemPeriod) },
				Capture: func(p *TotemPeriod, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := p.CaptureState(ownergraph.Reference[*period.Moment](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(p *TotemPeriod, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeTotemPeriodState(v, b)
					if e != nil {
						return e
					}
					return p.RestoreState(s, ownergraph.Loader[*period.Moment](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[ObjectPeriod]{Type: ObjectPeriodStateType, Version: ObjectPeriodStateVersion, Init: func() *ObjectPeriod { return new(ObjectPeriod) },
				Capture: func(p *ObjectPeriod, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := p.CaptureState(ownergraph.Reference[*period.Moment](ctx))
					if e != nil {
						return nil, e
					}
					return s.Encode()
				}, Restore: func(p *ObjectPeriod, v uint32, b []byte, ctx *ownergraph.Restore) error {
					s, e := DecodeObjectPeriodState(v, b)
					if e != nil {
						return e
					}
					return p.RestoreState(s, ownergraph.Loader[*period.Moment](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[HighPriestThekalParty]{Type: HighPriestThekalPartyStateType, Version: HighPriestThekalPartyStateVersion, Init: func() *HighPriestThekalParty { return new(HighPriestThekalParty) },
				Capture: func(c *HighPriestThekalParty, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx), ownergraph.Reference[messages.Message](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *HighPriestThekalParty, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeHighPriestThekalPartyState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx), ownergraph.Loader[messages.Message](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[SneedShredder]{Type: SneedShredderStateType, Version: SneedShredderStateVersion, Init: func() *SneedShredder { return new(SneedShredder) },
				Capture: func(c *SneedShredder, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx), ownergraph.Reference[messages.Message](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *SneedShredder, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeSneedShredderState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx), ownergraph.Loader[messages.Message](ctx))
				}})
		},
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[CthunParty]{Type: CthunPartyStateType, Version: CthunPartyStateVersion, Init: func() *CthunParty { return new(CthunParty) },
				Capture: func(c *CthunParty, ctx *ownergraph.Capture) ([]byte, error) {
					s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx), ownergraph.Reference[messages.Message](ctx))
					if e != nil {
						return nil, e
					}
					b, e := s.Encode()
					if e != nil {
						return nil, e
					}
					all, e := ctx.Ref(c.all)
					if e != nil {
						return nil, e
					}
					return json.Marshal(creatureGraphValue{State: b, All: all})
				}, Restore: func(c *CthunParty, v uint32, b []byte, ctx *ownergraph.Restore) error {
					var g creatureGraphValue
					if e := decodeCreatureValue(b, &g); e != nil {
						return e
					}
					b = g.State
					s, e := DecodeCthunPartyState(v, b)
					if e != nil {
						return e
					}
					all, e := ownergraph.ResolveAs[*characters.Characters](ctx, g.All)
					if e != nil {
						return e
					}
					return c.RestoreState(s, all, ownergraph.Loader[*characters.Common](ctx), ownergraph.Loader[messages.Message](ctx))
				}})
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
