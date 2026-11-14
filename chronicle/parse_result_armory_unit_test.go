package chronicle

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

type guildOnlyStore struct {
	database.Store
	names   []string
	realmID uuid.UUID
}

func (s *guildOnlyStore) UpsertGuild(_ context.Context, arg database.UpsertGuildParams) (database.Guild, error) {
	s.names = append(s.names, arg.Name)
	s.realmID = arg.RealmID
	return database.Guild{ID: uuid.New(), Name: arg.Name, RealmID: arg.RealmID}, nil
}

func TestInsertParsedGuildsRenameAndMajority(t *testing.T) {
	t.Parallel()
	a, b, c := guid.GUID(1).String(), guid.GUID(2).String(), guid.GUID(3).String()
	observation := parseresult.ArmoryObservation{
		Guilds: []parseresult.ObservedGuild{
			{Name: "Remnant", Members: []string{b, c}},
			{Name: "Zeta", Members: []string{a}},
			{Name: "Levia", Members: []string{a, b}},
			{Name: "Alpha", Members: []string{c}},
		}, ParticipantCount: 5,
	}
	realmID := uuid.New()
	for i := 0; i < 10; i++ {
		store := &guildOnlyStore{}
		majority, err := InsertParsedGuilds(context.Background(), store, realmID, "N'Zoth", time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC), observation)
		if err != nil {
			t.Fatal(err)
		}
		if majority == nil || majority.Name != "Remnant" || store.realmID != realmID || len(store.names) != 3 || store.names[0] != "Alpha" || store.names[1] != "Remnant" || store.names[2] != "Zeta" {
			t.Fatalf("rename, merge or lock order: majority=%+v names=%v", majority, store.names)
		}
	}
	observation.ParticipantCount = 6
	store := &guildOnlyStore{}
	majority, err := InsertParsedGuilds(context.Background(), store, realmID, "N'Zoth", time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC), observation)
	if err != nil || majority != nil {
		t.Fatalf("majority threshold: %v, %v", majority, err)
	}
}

func TestInsertParsedGuildsRejectsIncompleteOrInvalidPayload(t *testing.T) {
	t.Parallel()
	tests := []parseresult.ArmoryObservation{
		{Players: []parseresult.ObservedPlayer{{GUID: guid.GUID(1).String()}}},
		{ParticipantCount: -1},
		{Guilds: []parseresult.ObservedGuild{{Name: "A", Members: []string{"bad"}}}},
		{Guilds: []parseresult.ObservedGuild{{Name: "A", Members: []string{guid.GUID(0).String()}}}},
	}
	for _, observation := range tests {
		store := &guildOnlyStore{}
		if _, err := InsertParsedGuilds(context.Background(), store, uuid.New(), "N'Zoth", time.Time{}, observation); err == nil || len(store.names) != 0 {
			t.Fatalf("expected rejection before writes for %+v (writes: %v)", observation, store.names)
		}
	}
}
