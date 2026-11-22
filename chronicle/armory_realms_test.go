package chronicle

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// These are the methods intercepted by authz in production. Recording calls
// proves skipped players never reach relationship writes (even an empty batch).
type armoryWriteRecorder struct {
	database.Store
	players       []database.UpsertPlayersParams
	guilds        []database.UpsertGuildParams
	histories     []database.UpsertPlayerGearHistoryParams
	playerCalls   int
	metadataCalls int
}

func (s *armoryWriteRecorder) GetItemTemplateMetadataBatch(ctx context.Context, arg database.GetItemTemplateMetadataBatchParams) ([]database.GetItemTemplateMetadataBatchRow, error) {
	s.metadataCalls++
	return s.Store.GetItemTemplateMetadataBatch(ctx, arg)
}
func (s *armoryWriteRecorder) UpsertPlayers(ctx context.Context, args []database.UpsertPlayersParams) *database.UpsertPlayersBatchResults {
	s.playerCalls++
	s.players = append(s.players, args...)
	return s.Store.UpsertPlayers(ctx, args)
}
func (s *armoryWriteRecorder) UpsertGuild(ctx context.Context, arg database.UpsertGuildParams) (database.Guild, error) {
	s.guilds = append(s.guilds, arg)
	return s.Store.UpsertGuild(ctx, arg)
}
func (s *armoryWriteRecorder) UpsertPlayerGearHistory(ctx context.Context, args []database.UpsertPlayerGearHistoryParams) *database.UpsertPlayerGearHistoryBatchResults {
	s.histories = append(s.histories, args...)
	return s.Store.UpsertPlayerGearHistory(ctx, args)
}

func TestArmoryParticipantRealms(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name                         string
		legacy, unlisted, allSkipped bool
	}{
		{name: "mixed"}, {name: "unlisted", unlisted: true}, {name: "all skipped", allSkipped: true}, {name: "legacy", legacy: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			store, _ := dbtestutil.NewDB(t)
			owner, instanceRealm := insertVisibilityTestOwnerAndRealm(t, ctx, store)
			realm, err := store.GetWoWServerRealm(ctx, instanceRealm)
			require.NoError(t, err)
			us, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: realm.ServerID, Name: "Normal-US"})
			require.NoError(t, err)
			eu, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: realm.ServerID, Name: "Normal-EU"})
			require.NoError(t, err)
			observed := time.Date(2026, 1, 1, 1, 2, 3, 0, time.UTC)
			log := insertVisibilityTestLogGroup(t, ctx, store, owner)
			instance := insertVisibilityTestInstance(t, ctx, store, log, instanceRealm, "armory realms", observed)
			units := unitdb.New(nil)
			tracker := armory.New(units)
			for i, raw := range []string{"Normal-US", "Normal-EU", "", "not-cataloged", "Normal-US"} {
				id := guid.GUID(i + 1)
				guildName := "Eligible"
				if i >= 2 {
					guildName = "Skipped"
				}
				player := combatant.Combatant{Guid: id, Name: "Selected", RawRealm: raw, HeroClass: types.HeroClassesMAGE, Race: types.HeroRacesHuman, Gender: types.HeroGenderMale, Seen: observed, Guild: &combatant.Guild{Name: guildName}, GearSetups: make([]combatant.GearItem, 19)}
				player.GearSetups[0].ItemID = 123
				units.UpdatePlayer(player)
				tracker.Players[id] = player
				tracker.Participant[id] = struct{}{}
				if tracker.Guilds[guildName] == nil {
					tracker.Guilds[guildName] = make(map[guid.GUID]struct{})
				}
				tracker.Guilds[guildName][id] = struct{}{}
			}
			// A later conflicting name poisons all GUID-only armory snapshots, even
			// though the selected tracker name still has a resolvable home realm.
			units.UpdateUnitName(5, "Other")
			catalog := newParticipantRealmCatalog(realm.ServerID, []database.WowServerRealm{us, eu})
			if tc.allSkipped {
				catalog = nil
			}
			format := database.LogFormatV22Cleu
			if tc.legacy {
				format = database.LogFormatV9Cleu
			}
			recorder := &armoryWriteRecorder{Store: store}
			raidGuild, err := tracker.Insert(ctx, units, armoryProvenanceInstanceID(instance, tc.unlisted), instanceRealm, uuid.New(), recorder, armoryRealmResolver(format, units, catalog))
			require.NoError(t, err)
			if tc.allSkipped {
				require.Nil(t, raidGuild)
				require.Zero(t, recorder.playerCalls)
				require.Zero(t, recorder.metadataCalls)
				require.Empty(t, recorder.guilds)
				require.Empty(t, recorder.histories)
				return
			}
			wantCount := 2
			if tc.legacy {
				wantCount = 5
			}
			require.Len(t, recorder.players, wantCount)
			require.NotNil(t, raidGuild)
			require.Equal(t, instanceRealm, raidGuild.RealmID)
			wantGuild := "Eligible"
			if tc.legacy {
				wantGuild = "Skipped"
			}
			require.Equal(t, wantGuild, raidGuild.Name)
			if !tc.legacy {
				require.Len(t, recorder.guilds, 3) // US/EU memberships plus instance classification.
				keys := make([]string, 0, len(recorder.guilds))
				for _, guild := range recorder.guilds {
					keys = append(keys, guild.RealmID.String()+"/"+guild.Name)
				}
				require.True(t, slices.IsSorted(keys))
				for _, guild := range recorder.guilds {
					require.Equal(t, "Eligible", guild.Name)
				}
			}
			if tc.unlisted {
				require.Empty(t, recorder.histories)
			} else {
				require.Len(t, recorder.histories, wantCount)
			}
			for i, write := range recorder.players {
				require.Equal(t, guid.GUID(i+1), write.ID) // stable batch order
				wantRealm := instanceRealm
				if !tc.legacy {
					if i == 0 {
						wantRealm = us.ID
					} else {
						wantRealm = eu.ID
					}
				}
				require.Equal(t, wantRealm, write.RealmID)
				require.Equal(t, observed, write.UpdatedAt.Time)
				require.Equal(t, !tc.unlisted, write.UpdatedFromInstance.Valid)
				row, err := store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: wantRealm, Identifier: write.ID})
				require.NoError(t, err)
				require.True(t, observed.Equal(row.UpdatedAt.Time))
				require.Equal(t, write.GuildID, row.GuildID)
				guild, err := store.GetGuildByID(ctx, write.GuildID.UUID)
				require.NoError(t, err)
				require.Equal(t, wantRealm, guild.RealmID)
				if !tc.unlisted {
					require.Equal(t, wantRealm, recorder.histories[i].RealmID)
					require.Equal(t, observed, recorder.histories[i].EquippedAt.Time)
					history, err := store.GetPlayerGearHistory(ctx, database.GetPlayerGearHistoryParams{RealmID: wantRealm, PlayerID: write.ID, ResultLimit: 10})
					require.NoError(t, err)
					require.Len(t, history, 1)
				}
			}
			if !tc.legacy {
				for _, id := range []guid.GUID{3, 4, 5} {
					for _, realmID := range []uuid.UUID{instanceRealm, us.ID, eu.ID} {
						_, err := store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realmID, Identifier: id})
						require.ErrorIs(t, err, pgx.ErrNoRows)
					}
				}
			}
			// Historical observations cannot overwrite a newer profile.
			older := recorder.players[0]
			older.Name = "Old name"
			older.UpdatedAt = database.Timestamptz(observed.Add(-time.Hour))
			require.NoError(t, store.UpsertPlayers(ctx, []database.UpsertPlayersParams{older}).Close())
			row, err := store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: older.RealmID, Identifier: older.ID})
			require.NoError(t, err)
			require.Equal(t, "Selected", row.Name)
			require.Len(t, tracker.Players, 5) // persistence filtering must not mutate combat inputs.
			require.Len(t, tracker.Participant, 5)
		})
	}
}

type armoryRealmEvidence map[string]string

func (e armoryRealmEvidence) LookupPlayerRealm(_ guid.GUID, name string) (string, bool) {
	raw, ok := e[name]
	return raw, ok
}

func TestArmoryRealmResolverUsesSnapshotName(t *testing.T) {
	t.Parallel()
	server := uuid.New()
	us := database.WowServerRealm{ID: uuid.New(), ServerID: server, Name: "Normal-US"}
	eu := database.WowServerRealm{ID: uuid.New(), ServerID: server, Name: "Normal-EU"}
	units := unitdb.New(nil)
	units.SetPlayerRealmLookup(armoryRealmEvidence{"Snapshot": "Normal-US", "Latest": "Normal-EU"})
	units.UpdatePlayer(combatant.Combatant{Guid: 1, Name: "Latest"})
	resolve := armoryRealmResolver(database.LogFormatV22Cleu, units, newParticipantRealmCatalog(server, []database.WowServerRealm{us, eu}))
	require.Equal(t, us.ID, resolve(combatant.Combatant{Guid: 1, Name: "Snapshot"}).UUID)
	require.False(t, resolve(combatant.Combatant{Guid: 1, Name: "Unseen"}).Valid)
	require.Nil(t, armoryRealmResolver(database.LogFormatV9Cleu, units, nil))
}
