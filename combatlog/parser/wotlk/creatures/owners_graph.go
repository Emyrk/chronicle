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
			return ownergraph.Register(r, ownergraph.Codec[attumenTheHuntsman]{
				Type:     AttumenTheHuntsmanStateType,
				Version:  AttumenTheHuntsmanStateVersion,
				Init:     func() *attumenTheHuntsman { return new(attumenTheHuntsman) },
				Capture:  (*attumenTheHuntsman).captureGraphState,
				Restore:  (*attumenTheHuntsman).restoreGraphState,
				Validate: (*attumenTheHuntsman).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[malygosPhaseTwoAdd]{
				Type:     MalygosPhaseTwoAddStateType,
				Version:  MalygosPhaseTwoAddStateVersion,
				Init:     func() *malygosPhaseTwoAdd { return new(malygosPhaseTwoAdd) },
				Capture:  (*malygosPhaseTwoAdd).captureGraphState,
				Restore:  (*malygosPhaseTwoAdd).restoreGraphState,
				Validate: (*malygosPhaseTwoAdd).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[halionCharacter]{
				Type:     HalionCharacterStateType,
				Version:  HalionCharacterStateVersion,
				Init:     func() *halionCharacter { return new(halionCharacter) },
				Capture:  (*halionCharacter).captureGraphState,
				Restore:  (*halionCharacter).restoreGraphState,
				Validate: (*halionCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[razorscaleAdd]{
				Type:     RazorscaleAddStateType,
				Version:  RazorscaleAddStateVersion,
				Init:     func() *razorscaleAdd { return new(razorscaleAdd) },
				Capture:  (*razorscaleAdd).captureGraphState,
				Restore:  (*razorscaleAdd).restoreGraphState,
				Validate: (*razorscaleAdd).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[gunshipBattleCharacter]{
				Type:     GunshipBattleCharacterStateType,
				Version:  GunshipBattleCharacterStateVersion,
				Init:     func() *gunshipBattleCharacter { return new(gunshipBattleCharacter) },
				Capture:  (*gunshipBattleCharacter).captureGraphState,
				Restore:  (*gunshipBattleCharacter).restoreGraphState,
				Validate: (*gunshipBattleCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[valithriaDreamwalkerCharacter]{
				Type:     ValithriaDreamwalkerCharacterStateType,
				Version:  ValithriaDreamwalkerCharacterStateVersion,
				Init:     func() *valithriaDreamwalkerCharacter { return new(valithriaDreamwalkerCharacter) },
				Capture:  (*valithriaDreamwalkerCharacter).captureGraphState,
				Restore:  (*valithriaDreamwalkerCharacter).restoreGraphState,
				Validate: (*valithriaDreamwalkerCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[coilfangGuardian]{
				Type:     CoilfangGuardianStateType,
				Version:  CoilfangGuardianStateVersion,
				Init:     func() *coilfangGuardian { return new(coilfangGuardian) },
				Capture:  (*coilfangGuardian).captureGraphState,
				Restore:  (*coilfangGuardian).restoreGraphState,
				Validate: (*coilfangGuardian).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[kologarnCharacter]{
				Type:     KologarnCharacterStateType,
				Version:  KologarnCharacterStateVersion,
				Init:     func() *kologarnCharacter { return new(kologarnCharacter) },
				Capture:  (*kologarnCharacter).captureGraphState,
				Restore:  (*kologarnCharacter).restoreGraphState,
				Validate: (*kologarnCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[hodirCharacter]{
				Type:     HodirCharacterStateType,
				Version:  HodirCharacterStateVersion,
				Init:     func() *hodirCharacter { return new(hodirCharacter) },
				Capture:  (*hodirCharacter).captureGraphState,
				Restore:  (*hodirCharacter).restoreGraphState,
				Validate: (*hodirCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[freyaCharacter]{
				Type:     FreyaCharacterStateType,
				Version:  FreyaCharacterStateVersion,
				Init:     func() *freyaCharacter { return new(freyaCharacter) },
				Capture:  (*freyaCharacter).captureGraphState,
				Restore:  (*freyaCharacter).restoreGraphState,
				Validate: (*freyaCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[algalonCharacter]{
				Type:     AlgalonCharacterStateType,
				Version:  AlgalonCharacterStateVersion,
				Init:     func() *algalonCharacter { return new(algalonCharacter) },
				Capture:  (*algalonCharacter).captureGraphState,
				Restore:  (*algalonCharacter).restoreGraphState,
				Validate: (*algalonCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[assemblyOfIronCharacter]{
				Type:     AssemblyOfIronCharacterStateType,
				Version:  AssemblyOfIronCharacterStateVersion,
				Init:     func() *assemblyOfIronCharacter { return new(assemblyOfIronCharacter) },
				Capture:  (*assemblyOfIronCharacter).captureGraphState,
				Restore:  (*assemblyOfIronCharacter).restoreGraphState,
				Validate: (*assemblyOfIronCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[ladyDeathwhisperCharacter]{
				Type:     LadyDeathwhisperCharacterStateType,
				Version:  LadyDeathwhisperCharacterStateVersion,
				Init:     func() *ladyDeathwhisperCharacter { return new(ladyDeathwhisperCharacter) },
				Capture:  (*ladyDeathwhisperCharacter).captureGraphState,
				Restore:  (*ladyDeathwhisperCharacter).restoreGraphState,
				Validate: (*ladyDeathwhisperCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[professorPutricideCharacter]{
				Type:     ProfessorPutricideCharacterStateType,
				Version:  ProfessorPutricideCharacterStateVersion,
				Init:     func() *professorPutricideCharacter { return new(professorPutricideCharacter) },
				Capture:  (*professorPutricideCharacter).captureGraphState,
				Restore:  (*professorPutricideCharacter).restoreGraphState,
				Validate: (*professorPutricideCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[sindragosaCharacter]{
				Type:     SindragosaCharacterStateType,
				Version:  SindragosaCharacterStateVersion,
				Init:     func() *sindragosaCharacter { return new(sindragosaCharacter) },
				Capture:  (*sindragosaCharacter).captureGraphState,
				Restore:  (*sindragosaCharacter).restoreGraphState,
				Validate: (*sindragosaCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[lichKingCharacter]{
				Type:     LichKingCharacterStateType,
				Version:  LichKingCharacterStateVersion,
				Init:     func() *lichKingCharacter { return new(lichKingCharacter) },
				Capture:  (*lichKingCharacter).captureGraphState,
				Restore:  (*lichKingCharacter).restoreGraphState,
				Validate: (*lichKingCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[mimironCharacter]{
				Type:     MimironCharacterStateType,
				Version:  MimironCharacterStateVersion,
				Init:     func() *mimironCharacter { return new(mimironCharacter) },
				Capture:  (*mimironCharacter).captureGraphState,
				Restore:  (*mimironCharacter).restoreGraphState,
				Validate: (*mimironCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[mimironState]{
				Type:     MimironStateStateType,
				Version:  MimironStateStateVersion,
				Init:     func() *mimironState { return new(mimironState) },
				Capture:  (*mimironState).captureGraphState,
				Restore:  (*mimironState).restoreGraphState,
				Validate: (*mimironState).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[thorimCharacter]{
				Type:     ThorimCharacterStateType,
				Version:  ThorimCharacterStateVersion,
				Init:     func() *thorimCharacter { return new(thorimCharacter) },
				Capture:  (*thorimCharacter).captureGraphState,
				Restore:  (*thorimCharacter).restoreGraphState,
				Validate: (*thorimCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[thorimState]{
				Type:     ThorimStateStateType,
				Version:  ThorimStateStateVersion,
				Init:     func() *thorimState { return new(thorimState) },
				Capture:  (*thorimState).captureGraphState,
				Restore:  (*thorimState).restoreGraphState,
				Validate: (*thorimState).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[reliquaryCharacter]{
				Type:     ReliquaryCharacterStateType,
				Version:  ReliquaryCharacterStateVersion,
				Init:     func() *reliquaryCharacter { return new(reliquaryCharacter) },
				Capture:  (*reliquaryCharacter).captureGraphState,
				Restore:  (*reliquaryCharacter).restoreGraphState,
				Validate: (*reliquaryCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[reliquaryState]{
				Type:     ReliquaryStateStateType,
				Version:  ReliquaryStateStateVersion,
				Init:     func() *reliquaryState { return new(reliquaryState) },
				Capture:  (*reliquaryState).captureGraphState,
				Restore:  (*reliquaryState).restoreGraphState,
				Validate: (*reliquaryState).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[kaelThasCharacter]{
				Type:     KaelThasCharacterStateType,
				Version:  KaelThasCharacterStateVersion,
				Init:     func() *kaelThasCharacter { return new(kaelThasCharacter) },
				Capture:  (*kaelThasCharacter).captureGraphState,
				Restore:  (*kaelThasCharacter).restoreGraphState,
				Validate: (*kaelThasCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[kaelThasState]{
				Type:     KaelThasStateStateType,
				Version:  KaelThasStateStateVersion,
				Init:     func() *kaelThasState { return new(kaelThasState) },
				Capture:  (*kaelThasState).captureGraphState,
				Restore:  (*kaelThasState).restoreGraphState,
				Validate: (*kaelThasState).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[yoggSaronCharacter]{
				Type:     YoggSaronCharacterStateType,
				Version:  YoggSaronCharacterStateVersion,
				Init:     func() *yoggSaronCharacter { return new(yoggSaronCharacter) },
				Capture:  (*yoggSaronCharacter).captureGraphState,
				Restore:  (*yoggSaronCharacter).restoreGraphState,
				Validate: (*yoggSaronCharacter).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[yoggSaronState]{
				Type:     YoggSaronStateStateType,
				Version:  YoggSaronStateStateVersion,
				Init:     func() *yoggSaronState { return new(yoggSaronState) },
				Capture:  (*yoggSaronState).captureGraphState,
				Restore:  (*yoggSaronState).restoreGraphState,
				Validate: (*yoggSaronState).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[yoggSaronGuardian]{
				Type:     YoggSaronGuardianStateType,
				Version:  YoggSaronGuardianStateVersion,
				Init:     func() *yoggSaronGuardian { return new(yoggSaronGuardian) },
				Capture:  (*yoggSaronGuardian).captureGraphState,
				Restore:  (*yoggSaronGuardian).restoreGraphState,
				Validate: (*yoggSaronGuardian).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[LogBased]{
				Type:     LogBasedStateType,
				Version:  LogBasedStateVersion,
				Init:     func() *LogBased { return new(LogBased) },
				Capture:  (*LogBased).captureGraphState,
				Restore:  (*LogBased).restoreGraphState,
				Validate: (*LogBased).validateGraph,
			})
		}, func() error {
			return ownergraph.Register(r, ownergraph.Codec[Unstartable]{
				Type:     UnstartableStateType,
				Version:  UnstartableStateVersion,
				Init:     func() *Unstartable { return new(Unstartable) },
				Capture:  (*Unstartable).captureGraphState,
				Restore:  (*Unstartable).restoreGraphState,
				Validate: (*Unstartable).validateGraph,
			})
		}}
	for _, register := range registrations {
		if e := register(); e != nil {
			return e
		}
	}
	return nil
}
