package creatures

import (
	"encoding/json"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

func (c *kelThuzad) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *kelThuzad) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *vanillaPlusMograineCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *vanillaPlusMograineCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeVanillaPlusMograineState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
}

func (c *worgPupCaptures) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState()
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *worgPupCaptures) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeWorgPupCapturesState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s)
}

func (c *BloodaxeWorgPup) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *BloodaxeWorgPup) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *ThaddiusParty) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *ThaddiusParty) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *Totem) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Base[*TotemPeriod]](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *Totem) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeTotemState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Base[*TotemPeriod]](ctx))
}

func (c *Object) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Base[*ObjectPeriod]](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *Object) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeObjectState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Base[*ObjectPeriod]](ctx))
}

func (c *Critter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState()
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *Critter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCritterState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s)
}

func (c *DiscipleOfNaralex) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState()
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *DiscipleOfNaralex) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeDiscipleOfNaralexState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s)
}

func (c *archmageArugal) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[characters.CharacterBase](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *archmageArugal) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeArchmageArugalState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[characters.CharacterBase](ctx))
}

func (c *CoreHound) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *CoreHound) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCommonOwnerState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
}

func (c *Onyxia) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *Onyxia) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCommonOwnerState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
}

func (c *DiseasedGhoul) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *DiseasedGhoul) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCommonOwnerState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
}

func (c *HooktoothFrenzy) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *HooktoothFrenzy) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCommonOwnerState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
}

func (c *coreRager) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := c.CaptureState(ownergraph.Reference[*characters.Common](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (c *coreRager) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeCommonOwnerState(v, b)
	if e != nil {
		return e
	}
	return c.RestoreState(s, ownergraph.Loader[*characters.Common](ctx))
}

func (c *sonOfTheFlameCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *sonOfTheFlameCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *RazorAdCharacter) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *RazorAdCharacter) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *FragmentOfRupturan) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *FragmentOfRupturan) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *MajordomoParty) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *MajordomoParty) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *broodlordLashlayer) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *broodlordLashlayer) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *razorgore) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *razorgore) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *shadowflameSpark) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *shadowflameSpark) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (p *TotemPeriod) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := p.CaptureState(ownergraph.Reference[*period.Moment](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (p *TotemPeriod) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeTotemPeriodState(v, b)
	if e != nil {
		return e
	}
	return p.RestoreState(s, ownergraph.Loader[*period.Moment](ctx))
}

func (p *ObjectPeriod) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
	s, e := p.CaptureState(ownergraph.Reference[*period.Moment](ctx))
	if e != nil {
		return nil, e
	}
	return s.Encode()
}

func (p *ObjectPeriod) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
	s, e := DecodeObjectPeriodState(v, b)
	if e != nil {
		return e
	}
	return p.RestoreState(s, ownergraph.Loader[*period.Moment](ctx))
}

func (c *HighPriestThekalParty) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *HighPriestThekalParty) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *SneedShredder) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *SneedShredder) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}

func (c *CthunParty) captureGraphState(ctx *ownergraph.Capture) ([]byte, error) {
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
}

func (c *CthunParty) restoreGraphState(v uint32, b []byte, ctx *ownergraph.Restore) error {
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
}
