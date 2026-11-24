package modern

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestPlaguelandsV22SummonOwnership(t *testing.T) {
	t.Parallel()
	input := strings.Join([]string{
		`11/23/2026 21:47:15.000-1  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18`,
		`11/23/2026 21:47:15.608-1  SPELL_SUMMON,Player-6949-0061E20C,"Player",0x512,0x80000000,Creature-0-7091-329-113066-264850-000004C274,"Hawk",0xa28,0x80000000,1293248,"Summon Hawk",0x1`,
		`11/23/2026 21:51:59.137-1  SPELL_SUMMON,Player-6949-0061E20C,"Player",0x512,0x80000000,Creature-0-7091-329-113066-264850-000004C38F,"Hawk",0xa28,0x80000000,1312637,"Summon Hawk",0x1`,
		`11/23/2026 22:27:42.348-1  SPELL_SUMMON,Creature-0-7091-329-113066-10440-000004C16D,"Baron Rivendare",0x10a48,0x80000000,Creature-0-7091-329-113066-11197-000004CBEE,"Mindless Skeleton",0xa28,0x80000000,17475,"Raise Dead",0x20`,
		`11/23/2026 23:00:45.800-1  SPELL_SUMMON,Player-6937-009B320C,"Player",0x512,0x80000000,Creature-0-7096-289-119052-264850-000004D3AE,"Hawk",0xa28,0x80000000,1293248,"Summon Hawk",0x1`,
		`11/23/2026 23:10:41.525-1  SPELL_SUMMON,Creature-0-7096-289-119052-10498-000204D20A,"Spectral Tutor",0xa48,0x80000080,Creature-0-7096-289-119052-11263-000004D602,"Spectral Projection",0xa28,0x80000000,17653,"Summon Spectral Projections",0x1`,
	}, "\n")
	p, err := New(t.Context(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	units := unitdb.New(database.WoWFlavor{database.FlavorVanilla, database.FlavorWoWForever})
	var owners []*messages.NewOwner
	for {
		batch, err := p.Advance(t.Context())
		for _, msg := range batch {
			require.NoError(t, units.ProcessMessage(msg))
			if owner, ok := msg.(*messages.NewOwner); ok {
				owners = append(owners, owner)
			}
		}
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
	}
	require.Len(t, owners, 5)
	for i, want := range []struct {
		entry, ownerEntry uint32
		player            guid.GUID
	}{
		{264850, 0, guid.GUID(6949)<<32 | 0x0061E20C},
		{264850, 0, guid.GUID(6949)<<32 | 0x0061E20C},
		{11197, 10440, 0},
		{264850, 0, guid.GUID(6937)<<32 | 0x009B320C},
		{11263, 10498, 0},
	} {
		owner := owners[i]
		require.True(t, owner.Target.IsCreature())
		entry, ok := owner.Target.GetEntry()
		require.True(t, ok)
		require.Equal(t, want.entry, entry)
		if want.player != 0 {
			require.Equal(t, want.player, owner.NewOwner)
			require.Equal(t, unitdb.CategoryGuardian, units.Category(owner.Target))
		} else {
			require.True(t, owner.NewOwner.IsCreature())
			entry, ok := owner.NewOwner.GetEntry()
			require.True(t, ok)
			require.Equal(t, want.ownerEntry, entry)
		}
		info, ok := units.Get(owner.Target)
		require.True(t, ok)
		require.NotNil(t, info.Owner)
		require.Equal(t, owner.NewOwner, *info.Owner)
	}
}
