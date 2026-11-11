package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestBWLOwnerStates(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	room := new(characters.RoomMechanic)
	start := characters.NewStartsNewFight(common)
	n := &nefarian{RoomMechanic: room, all: all, p2Emitted: true}
	ns, e := n.CaptureState(func(*characters.RoomMechanic) (string, error) { return "room", nil })
	require.NoError(t, e)
	nb, e := ns.Encode()
	require.NoError(t, e)
	ns, e = DecodeNefarianState(NefarianStateVersion, nb)
	require.NoError(t, e)
	nn := InitNefarian()
	require.NoError(t, nn.RestoreState(ns, all, func(string) (*characters.RoomMechanic, error) { return room, nil }))
	require.Same(t, room, nn.RoomMechanic)
	require.True(t, nn.p2Emitted)
	require.Error(t, nn.RestoreState(ns, all, func(string) (*characters.RoomMechanic, error) { return nil, nil }))
	require.True(t, nn.p2Emitted)
	b := &broodlordLashlayer{StartsNewFight: start, all: all}
	bs, e := b.CaptureState(func(*characters.StartsNewFight) (string, error) { return "start", nil })
	require.NoError(t, e)
	bb, e := bs.Encode()
	require.NoError(t, e)
	bs, e = DecodeBroodlordLashlayerState(BroodlordLashlayerStateVersion, bb)
	require.NoError(t, e)
	bn := InitBroodlordLashlayer()
	require.NoError(t, bn.RestoreState(bs, all, func(string) (*characters.StartsNewFight, error) { return start, nil }))
	require.Same(t, start, bn.StartsNewFight)
	r := &razorgore{Common: common, all: all, eggThreshold: 30, eggCount: 29, adsGone: false}
	rs, e := r.CaptureState(func(*characters.Common) (string, error) { return "common", nil })
	require.NoError(t, e)
	rb, e := rs.Encode()
	require.NoError(t, e)
	rs, e = DecodeRazorgoreState(RazorgoreStateVersion, rb)
	require.NoError(t, e)
	rn := InitRazorgore()
	require.NoError(t, rn.RestoreState(rs, all, func(string) (*characters.Common, error) { return common, nil }))
	require.Equal(t, 30, rn.eggThreshold)
	require.Equal(t, 29, rn.eggCount)
	require.False(t, rn.adsGone)
	require.Error(t, rn.RestoreState(rs, all, func(string) (*characters.Common, error) { return nil, nil }))
	require.Equal(t, 29, rn.eggCount)
	spark := &shadowflameSpark{Common: common, all: all, done: true}
	ss, e := spark.CaptureState(func(*characters.Common) (string, error) { return "common", nil })
	require.NoError(t, e)
	sb, e := ss.Encode()
	require.NoError(t, e)
	ss, e = DecodeShadowflameSparkState(ShadowflameSparkStateVersion, sb)
	require.NoError(t, e)
	sn := InitShadowflameSpark()
	require.NoError(t, sn.RestoreState(ss, all, func(string) (*characters.Common, error) { return common, nil }))
	require.True(t, sn.done)
	// A completed spark remains a no-op, without constructor name/owner writes.
	require.NoError(t, sn.Process(messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))))
	require.Empty(t, all.DB().Info)
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
}
func TestBWLOwnersRejectIncomplete(t *testing.T) {
	t.Parallel()
	_, e := DecodeNefarianState(NefarianStateVersion, []byte(`{"reference":"r"}`))
	require.Error(t, e)
	_, e = DecodeBroodlordLashlayerState(BroodlordLashlayerStateVersion, []byte(`{"reference":null}`))
	require.Error(t, e)
	_, e = DecodeRazorgoreState(RazorgoreStateVersion, []byte(`{"reference":"r","egg_threshold":30,"egg_count":29}`))
	require.Error(t, e)
	_, e = DecodeShadowflameSparkState(ShadowflameSparkStateVersion, []byte(`{"reference":"r","done":null}`))
	require.Error(t, e)
}
