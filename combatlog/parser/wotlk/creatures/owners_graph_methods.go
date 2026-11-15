package creatures

import "github.com/Emyrk/chronicle/internal/stategraph/ownergraph"

func (c *attumenTheHuntsman) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *malygosPhaseTwoAdd) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *halionCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *razorscaleAdd) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *gunshipBattleCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *valithriaDreamwalkerCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *coilfangGuardian) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *kologarnCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *hodirCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *freyaCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *algalonCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *assemblyOfIronCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *ladyDeathwhisperCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *professorPutricideCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *sindragosaCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *lichKingCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *mimironCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *mimironState) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *thorimCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *thorimState) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *reliquaryCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *reliquaryState) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *kaelThasCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *kaelThasState) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *yoggSaronCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *yoggSaronState) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *yoggSaronGuardian) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *LogBased) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *Unstartable) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	if e := c.validateGraph(); e != nil {
		return nil, e
	}
	s, e := c.CaptureState(ctx.Ref)
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *attumenTheHuntsman) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeAttumenTheHuntsmanState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *malygosPhaseTwoAdd) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeMalygosPhaseTwoAddState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *halionCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeHalionCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *razorscaleAdd) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeRazorscaleAddState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *gunshipBattleCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeGunshipBattleCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *valithriaDreamwalkerCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeValithriaDreamwalkerCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *coilfangGuardian) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCoilfangGuardianState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *kologarnCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeKologarnCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *hodirCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeHodirCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *freyaCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeFreyaCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *algalonCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeAlgalonCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *assemblyOfIronCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeAssemblyOfIronCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *ladyDeathwhisperCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeLadyDeathwhisperCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *professorPutricideCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeProfessorPutricideCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *sindragosaCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeSindragosaCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *lichKingCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeLichKingCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *mimironCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeMimironCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *mimironState) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeMimironStateState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *thorimCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeThorimCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *thorimState) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeThorimStateState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *reliquaryCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeReliquaryCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *reliquaryState) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeReliquaryStateState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *kaelThasCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeKaelThasCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *kaelThasState) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeKaelThasStateState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *yoggSaronCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeYoggSaronCharacterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *yoggSaronState) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeYoggSaronStateState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *yoggSaronGuardian) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeYoggSaronGuardianState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *LogBased) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeLogBasedState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}

func (c *Unstartable) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeUnstartableState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ctx.Load, ctx.Resolve)
}
