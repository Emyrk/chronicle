package creatures

import (
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterGraphOwners registers only explicitly supported TBC/Wrath owners.
// Common and Vanilla dependencies are registered separately by composition.
func RegisterGraphOwners(r *ownergraph.Registry) error {
	registrations := []func() error{
		func() error { return registerXT002GraphOwner(r) },
		func() error {
			return ownergraph.Register(r, ownergraph.Codec[attumenTheHuntsman]{Type: AttumenTheHuntsmanStateType, Version: AttumenTheHuntsmanStateVersion, Init: func() *attumenTheHuntsman { return new(attumenTheHuntsman) }, Capture: func(c *attumenTheHuntsman, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *attumenTheHuntsman, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeAttumenTheHuntsmanState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*attumenTheHuntsman).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[malygosPhaseTwoAdd]{Type: MalygosPhaseTwoAddStateType, Version: MalygosPhaseTwoAddStateVersion, Init: func() *malygosPhaseTwoAdd { return new(malygosPhaseTwoAdd) }, Capture: func(c *malygosPhaseTwoAdd, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *malygosPhaseTwoAdd, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeMalygosPhaseTwoAddState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*malygosPhaseTwoAdd).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[halionCharacter]{Type: HalionCharacterStateType, Version: HalionCharacterStateVersion, Init: func() *halionCharacter { return new(halionCharacter) }, Capture: func(c *halionCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *halionCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeHalionCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*halionCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[razorscaleAdd]{Type: RazorscaleAddStateType, Version: RazorscaleAddStateVersion, Init: func() *razorscaleAdd { return new(razorscaleAdd) }, Capture: func(c *razorscaleAdd, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *razorscaleAdd, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeRazorscaleAddState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*razorscaleAdd).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[gunshipBattleCharacter]{Type: GunshipBattleCharacterStateType, Version: GunshipBattleCharacterStateVersion, Init: func() *gunshipBattleCharacter { return new(gunshipBattleCharacter) }, Capture: func(c *gunshipBattleCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *gunshipBattleCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeGunshipBattleCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*gunshipBattleCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[valithriaDreamwalkerCharacter]{Type: ValithriaDreamwalkerCharacterStateType, Version: ValithriaDreamwalkerCharacterStateVersion, Init: func() *valithriaDreamwalkerCharacter { return new(valithriaDreamwalkerCharacter) }, Capture: func(c *valithriaDreamwalkerCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *valithriaDreamwalkerCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeValithriaDreamwalkerCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*valithriaDreamwalkerCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[coilfangGuardian]{Type: CoilfangGuardianStateType, Version: CoilfangGuardianStateVersion, Init: func() *coilfangGuardian { return new(coilfangGuardian) }, Capture: func(c *coilfangGuardian, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *coilfangGuardian, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeCoilfangGuardianState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*coilfangGuardian).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[kologarnCharacter]{Type: KologarnCharacterStateType, Version: KologarnCharacterStateVersion, Init: func() *kologarnCharacter { return new(kologarnCharacter) }, Capture: func(c *kologarnCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *kologarnCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeKologarnCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*kologarnCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[hodirCharacter]{Type: HodirCharacterStateType, Version: HodirCharacterStateVersion, Init: func() *hodirCharacter { return new(hodirCharacter) }, Capture: func(c *hodirCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *hodirCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeHodirCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*hodirCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[freyaCharacter]{Type: FreyaCharacterStateType, Version: FreyaCharacterStateVersion, Init: func() *freyaCharacter { return new(freyaCharacter) }, Capture: func(c *freyaCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *freyaCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeFreyaCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*freyaCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[algalonCharacter]{Type: AlgalonCharacterStateType, Version: AlgalonCharacterStateVersion, Init: func() *algalonCharacter { return new(algalonCharacter) }, Capture: func(c *algalonCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *algalonCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeAlgalonCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*algalonCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[assemblyOfIronCharacter]{Type: AssemblyOfIronCharacterStateType, Version: AssemblyOfIronCharacterStateVersion, Init: func() *assemblyOfIronCharacter { return new(assemblyOfIronCharacter) }, Capture: func(c *assemblyOfIronCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *assemblyOfIronCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeAssemblyOfIronCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*assemblyOfIronCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[ladyDeathwhisperCharacter]{Type: LadyDeathwhisperCharacterStateType, Version: LadyDeathwhisperCharacterStateVersion, Init: func() *ladyDeathwhisperCharacter { return new(ladyDeathwhisperCharacter) }, Capture: func(c *ladyDeathwhisperCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *ladyDeathwhisperCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeLadyDeathwhisperCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*ladyDeathwhisperCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[professorPutricideCharacter]{Type: ProfessorPutricideCharacterStateType, Version: ProfessorPutricideCharacterStateVersion, Init: func() *professorPutricideCharacter { return new(professorPutricideCharacter) }, Capture: func(c *professorPutricideCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *professorPutricideCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeProfessorPutricideCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*professorPutricideCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[sindragosaCharacter]{Type: SindragosaCharacterStateType, Version: SindragosaCharacterStateVersion, Init: func() *sindragosaCharacter { return new(sindragosaCharacter) }, Capture: func(c *sindragosaCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *sindragosaCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeSindragosaCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*sindragosaCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[lichKingCharacter]{Type: LichKingCharacterStateType, Version: LichKingCharacterStateVersion, Init: func() *lichKingCharacter { return new(lichKingCharacter) }, Capture: func(c *lichKingCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *lichKingCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeLichKingCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*lichKingCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[mimironCharacter]{Type: MimironCharacterStateType, Version: MimironCharacterStateVersion, Init: func() *mimironCharacter { return new(mimironCharacter) }, Capture: func(c *mimironCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *mimironCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeMimironCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*mimironCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[mimironState]{Type: MimironStateStateType, Version: MimironStateStateVersion, Init: func() *mimironState { return new(mimironState) }, Capture: func(c *mimironState, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *mimironState, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeMimironStateState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*mimironState).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[thorimCharacter]{Type: ThorimCharacterStateType, Version: ThorimCharacterStateVersion, Init: func() *thorimCharacter { return new(thorimCharacter) }, Capture: func(c *thorimCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *thorimCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeThorimCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*thorimCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[thorimState]{Type: ThorimStateStateType, Version: ThorimStateStateVersion, Init: func() *thorimState { return new(thorimState) }, Capture: func(c *thorimState, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *thorimState, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeThorimStateState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*thorimState).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[reliquaryCharacter]{Type: ReliquaryCharacterStateType, Version: ReliquaryCharacterStateVersion, Init: func() *reliquaryCharacter { return new(reliquaryCharacter) }, Capture: func(c *reliquaryCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *reliquaryCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeReliquaryCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*reliquaryCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[reliquaryState]{Type: ReliquaryStateStateType, Version: ReliquaryStateStateVersion, Init: func() *reliquaryState { return new(reliquaryState) }, Capture: func(c *reliquaryState, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *reliquaryState, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeReliquaryStateState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*reliquaryState).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[kaelThasCharacter]{Type: KaelThasCharacterStateType, Version: KaelThasCharacterStateVersion, Init: func() *kaelThasCharacter { return new(kaelThasCharacter) }, Capture: func(c *kaelThasCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *kaelThasCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeKaelThasCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*kaelThasCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[kaelThasState]{Type: KaelThasStateStateType, Version: KaelThasStateStateVersion, Init: func() *kaelThasState { return new(kaelThasState) }, Capture: func(c *kaelThasState, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *kaelThasState, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeKaelThasStateState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*kaelThasState).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[yoggSaronCharacter]{Type: YoggSaronCharacterStateType, Version: YoggSaronCharacterStateVersion, Init: func() *yoggSaronCharacter { return new(yoggSaronCharacter) }, Capture: func(c *yoggSaronCharacter, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *yoggSaronCharacter, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeYoggSaronCharacterState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*yoggSaronCharacter).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[yoggSaronState]{Type: YoggSaronStateStateType, Version: YoggSaronStateStateVersion, Init: func() *yoggSaronState { return new(yoggSaronState) }, Capture: func(c *yoggSaronState, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *yoggSaronState, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeYoggSaronStateState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*yoggSaronState).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[yoggSaronGuardian]{Type: YoggSaronGuardianStateType, Version: YoggSaronGuardianStateVersion, Init: func() *yoggSaronGuardian { return new(yoggSaronGuardian) }, Capture: func(c *yoggSaronGuardian, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *yoggSaronGuardian, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeYoggSaronGuardianState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*yoggSaronGuardian).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[LogBased]{Type: LogBasedStateType, Version: LogBasedStateVersion, Init: func() *LogBased { return new(LogBased) }, Capture: func(c *LogBased, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *LogBased, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeLogBasedState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*LogBased).validateGraph})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[Unstartable]{Type: UnstartableStateType, Version: UnstartableStateVersion, Init: func() *Unstartable { return new(Unstartable) }, Capture: func(c *Unstartable, ctx *ownergraph.Capture) ([]byte, error) {
				if e := c.validateGraph(); e != nil {
					return nil, e
				}
				s, e := c.CaptureState(ctx.Ref)
				if e != nil {
					return nil, e
				}
				return s.Encode()
			}, Restore: func(c *Unstartable, v uint32, b []byte, ctx *ownergraph.Restore) error {
				s, e := DecodeUnstartableState(v, b)
				if e != nil {
					return e
				}
				return c.RestoreState(s, ctx.Load, ctx.Resolve)
			}, Validate: (*Unstartable).validateGraph})
		}}
	for _, register := range registrations {
		if e := register(); e != nil {
			return e
		}
	}
	return nil
}
