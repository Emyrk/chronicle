package chronicle

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func TestScoutingGuildDisplay(t *testing.T) {
	t.Parallel()
	lastSeen := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	observed := lastSeen.Add(-7 * 24 * time.Hour)
	for _, tc := range []struct {
		name         string
		at           time.Time
		scout        *string
		combat       *combatant.Guild
		want         *string
		supplemental bool
	}{
		{"known scout", lastSeen, ptr.Ref("Scouted"), nil, ptr.Ref("Scouted"), true},
		{"guildless scout", lastSeen, ptr.Ref(""), nil, ptr.Ref(""), true},
		{"unknown scout", lastSeen, nil, nil, nil, false},
		{"future observation", observed.Add(-time.Second), ptr.Ref("Scouted"), nil, nil, false},
		{"expiry inclusive", lastSeen.Add(24 * time.Hour), ptr.Ref("Scouted"), nil, ptr.Ref("Scouted"), true},
		{"expired", lastSeen.Add(24*time.Hour + time.Millisecond), ptr.Ref("Scouted"), nil, nil, false},
		{"combat membership wins", lastSeen, ptr.Ref("Scouted"), &combatant.Guild{Name: "Combat"}, ptr.Ref("Combat"), false},
		{"combat guildless wins", lastSeen, ptr.Ref("Scouted"), &combatant.Guild{}, ptr.Ref(""), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			players := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Scout", LastSeen: lastSeen.Unix(), Observations: []scouting.Observation{{At: observed.Unix(), Guild: tc.scout}}}}})
			raw := &messages.Combatant{MessageBase: messages.Base(tc.at), Combatant: combatant.Combatant{Guid: 1, Name: "Scout", Seen: tc.at, Guild: tc.combat}}
			adv := scoutingAdvancer{players: players, realms: map[guid.GUID]uuid.UUID{1: uuid.New()}, source: scoutingTestSource{messages: []messages.Message{raw}}}
			batch, _ := adv.Advance(t.Context())
			enriched := batch[0].(*messages.Combatant)
			require.Equal(t, tc.supplemental, enriched.ScoutingGuild)
			encoded, err := proto.Marshal(types2proto.CombatantInfo(tc.at, 0, enriched))
			require.NoError(t, err)
			var decoded chronicleproto.CombatantInfo
			require.NoError(t, proto.Unmarshal(encoded, &decoded))
			require.Equal(t, tc.want, decoded.GuildName, "serialized field distinguishes unknown from explicit guildlessness")
			require.Equal(t, tc.combat, raw.Guild, "parser-owned message stays unchanged")
			tracker := armory.New(nil)
			require.NoError(t, tracker.ProcessMessage(true, uuid.New(), enriched))
			require.Empty(t, tracker.Participant, "a guild observation cannot add a participant/vote denominator")
			require.Equal(t, tc.combat, tracker.Players[1].Guild, "only raw guild evidence reaches combat armory")
			if tc.combat == nil || tc.combat.Name == "" {
				require.Empty(t, tracker.Guilds)
			} else {
				require.Contains(t, tracker.Guilds[tc.combat.Name], guid.GUID(1))
			}
		})
	}
}

func TestScoutingGuildDoesNotEraseTrackedCombatGuild(t *testing.T) {
	t.Parallel()
	tracker := armory.New(nil)
	raw := &messages.Combatant{Combatant: combatant.Combatant{Guid: 1, Name: "Scout", Seen: time.Unix(10, 0), Guild: &combatant.Guild{Name: "Combat"}}}
	require.NoError(t, tracker.ProcessMessage(true, uuid.New(), raw))
	supplemental := &messages.Combatant{ScoutingGuild: true, Combatant: combatant.Combatant{Guid: 1, Name: "Scout", Seen: time.Unix(20, 0), Guild: &combatant.Guild{}}}
	require.NoError(t, tracker.ProcessMessage(true, uuid.New(), supplemental))
	require.Equal(t, "Combat", tracker.Players[1].Guild.Name)
	require.Contains(t, tracker.Guilds["Combat"], guid.GUID(1))
	require.Len(t, tracker.Guilds, 1)
}
