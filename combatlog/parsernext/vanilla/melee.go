package vanilla

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/Emyrk/chronicle/internal/ptr"
)

type SwingHitInfo bitmask.Bitmask32

func (h SwingHitInfo) Has(flag SwingHitInfo) bool {
	return h&flag == flag
}

const (
	HITINFO_NORMALSWING     SwingHitInfo = 0
	HITINFO_UNK0            SwingHitInfo = 1
	HITINFO_AFFECTS_VICTIM  SwingHitInfo = 2
	HITINFO_LEFTSWING       SwingHitInfo = 4 //       -- Off-hand attack
	HITINFO_UNK3            SwingHitInfo = 8
	HITINFO_MISS            SwingHitInfo = 16
	HITINFO_ABSORB          SwingHitInfo = 32
	HITINFO_RESIST          SwingHitInfo = 64
	HITINFO_CRITICALHIT     SwingHitInfo = 128
	HITINFO_UNK8            SwingHitInfo = 256
	HITINFO_UNK9            SwingHitInfo = 8192
	HITINFO_GLANCING        SwingHitInfo = 16384
	HITINFO_CRUSHING        SwingHitInfo = 32768
	HITINFO_NOACTION        SwingHitInfo = 65536
	HITINFO_SWINGNOHITSOUND SwingHitInfo = 524288
)

type VictimState uint16

const (
	VICTIMSTATE_UNAFFECTED VictimState = 0 // -- Seen with HITINFO_MISS
	VICTIMSTATE_NORMAL     VictimState = 1
	VICTIMSTATE_DODGE      VictimState = 2
	VICTIMSTATE_PARRY      VictimState = 3
	VICTIMSTATE_INTERRUPT  VictimState = 4
	VICTIMSTATE_BLOCKS     VictimState = 5
	VICTIMSTATE_EVADES     VictimState = 6
	VICTIMSTATE_IS_IMMUNE  VictimState = 7
	VICTIMSTATE_DEFLECTS   VictimState = 8
)

//nolint:staticcheck
func HitType(amount int32, components int32, info SwingHitInfo, state VictimState) types.HitType {
	// TODO: Handle blocks, evades, immunities, deflections
	var t types.HitType

	base := types.HitTypeNone
	//
	//if info.Has(HITINFO_RESIST) && components > 1 {
	//	// The proc was resisted.
	//	// TODO: Should we care?
	//}

	switch {
	case info.Has(HITINFO_CRITICALHIT):
		base = types.HitTypeCrit
	case info.Has(HITINFO_GLANCING):
		base = types.HitTypeGlancing
	case info.Has(HITINFO_CRUSHING):
		base = types.HitTypeCrushing
	case info.Has(HITINFO_MISS):
		base = types.HitTypeMiss
	case info.Has(HITINFO_ABSORB):
		// Trailer is done separately, but we can still mark it as a hit
		t |= types.HitTypeHit
	case info.Has(HITINFO_NOACTION):
	// TODO: ?
	case info.Has(HITINFO_AFFECTS_VICTIM):
		// This happens on dodge/parry as well
	}

	if info.Has(HITINFO_LEFTSWING) {
		t |= types.HitTypeOffHand
	} else {
		t |= types.HitTypeMainHand
	}

	switch state {
	case VICTIMSTATE_UNAFFECTED:
		t |= types.HitTypeMiss // With the info miss
	case VICTIMSTATE_DODGE:
		t |= types.HitTypeDodge
	case VICTIMSTATE_BLOCKS:
		if amount == 0 {
			t |= types.HitTypeFullBlock
		} else {
			t |= types.HitTypePartialBlock
		}
	case VICTIMSTATE_DEFLECTS:
		t |= types.HitTypeDeflect
	case VICTIMSTATE_EVADES:
		t |= types.HitTypeEvade
	case VICTIMSTATE_IS_IMMUNE:
		t |= types.HitTypeImmune
	case VICTIMSTATE_PARRY:
		t |= types.HitTypeParry
	case VICTIMSTATE_INTERRUPT:
		// TODO: ?
	case VICTIMSTATE_NORMAL:
		if base == 0 {
			base = types.HitTypeHit
		}
		t |= base
	default:
		// TODO: ?
	}

	return t
}

func Trailer(blocked, absorbed, resisted int32) types.Trailer {
	if blocked == 0 && resisted == 0 && absorbed == 0 {
		return nil
	}
	t := make(types.Trailer, 0)
	if blocked > 0 {
		t = append(t, BlockTrailer(blocked))
	}
	if resisted > 0 {
		t = append(t, Resisted(resisted))
	}
	if absorbed > 0 {
		t = append(t, Absorbed(absorbed))
	}
	return t
}

func BlockTrailer(blocked int32) types.TrailerEntry {
	return types.TrailerEntry{
		Amount:  ptr.Ref(uint32(blocked)),
		HitType: types.HitTypePartialBlock,
	}
}

func Resisted(resisted int32) types.TrailerEntry {
	return types.TrailerEntry{
		Amount:  ptr.Ref(uint32(resisted)),
		HitType: types.HitTypePartialResist,
	}
}

func Absorbed(absorbed int32) types.TrailerEntry {
	return types.TrailerEntry{
		Amount:  ptr.Ref(uint32(absorbed)),
		HitType: types.HitTypePartialAbsorb,
	}
}
