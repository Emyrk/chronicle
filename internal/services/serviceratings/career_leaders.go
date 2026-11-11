package serviceratings

import (
	"cmp"
	"context"
	"slices"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
)

// CareerBoardSorts are the career board's rankings.
var CareerBoardSorts = []string{"mastery", "peak", "renown"}

// RankCareerBoard keeps subjects that have the sorted value ("mastery",
// "peak", or "renown") and orders them best first, breaking ties by identity
// so pages are stable.
func RankCareerBoard(entries []CareerBoardEntry, sort string) []CareerBoardEntry {
	value := func(e CareerBoardEntry) (float64, bool) {
		switch sort {
		case "peak":
			if e.Peak == nil {
				return 0, false
			}
			return *e.Peak, true
		case "renown":
			return e.Renown, e.Renown > 0
		default:
			if e.Mastery == nil {
				return 0, false
			}
			return *e.Mastery, true
		}
	}
	out := make([]CareerBoardEntry, 0, len(entries))
	for _, e := range entries {
		if _, ok := value(e); ok {
			out = append(out, e)
		}
	}
	slices.SortStableFunc(out, func(a, b CareerBoardEntry) int {
		av, _ := value(a)
		bv, _ := value(b)
		return cmp.Or(cmp.Compare(bv, av), cmp.Compare(a.RealmID.String(), b.RealmID.String()), cmp.Compare(a.SubjectID, b.SubjectID))
	})
	return out
}

// CareerSubjectKey identifies a character (by GUID) or guild (by ID) on a realm.
type CareerSubjectKey struct {
	Realm uuid.UUID
	ID    string
}

// CareerSubjectName is a board subject's display metadata.
type CareerSubjectName struct {
	Name      string
	RealmName string
	// PlayerClass and GuildName are characters only; LogoURL is guilds only.
	PlayerClass string
	GuildName   string
	LogoURL     string
}

// CareerBoardNames looks up display names once for every subject given.
func CareerBoardNames(ctx context.Context, db database.Store, guilds bool, entries []CareerBoardEntry) (map[CareerSubjectKey]CareerSubjectName, error) {
	out := map[CareerSubjectKey]CareerSubjectName{}
	seen := map[CareerSubjectKey]bool{}
	var realms []uuid.UUID
	var ids []string
	var guildIDs []uuid.UUID
	for _, e := range entries {
		k := CareerSubjectKey{e.RealmID, e.SubjectID}
		if seen[k] {
			continue
		}
		seen[k] = true
		if guilds {
			if id, err := uuid.Parse(e.SubjectID); err == nil {
				guildIDs = append(guildIDs, id)
			}
			continue
		}
		realms, ids = append(realms, e.RealmID), append(ids, e.SubjectID)
	}
	if guilds {
		if len(guildIDs) == 0 {
			return out, nil
		}
		rows, err := db.ListLeaderboardCareerGuildNames(ctx, guildIDs)
		if err != nil {
			return nil, err
		}
		byID := map[string]database.ListLeaderboardCareerGuildNamesRow{}
		for _, row := range rows {
			byID[row.ID.String()] = row
		}
		for k := range seen {
			if row, ok := byID[k.ID]; ok {
				out[k] = CareerSubjectName{Name: row.Name, RealmName: row.RealmName, LogoURL: row.LogoUrl}
			}
		}
		return out, nil
	}
	if len(realms) == 0 {
		return out, nil
	}
	rows, err := db.ListLeaderboardCareerPlayerNames(ctx, database.ListLeaderboardCareerPlayerNamesParams{RealmIds: realms, SubjectIds: ids})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[CareerSubjectKey{row.RealmID, row.SubjectID}] = CareerSubjectName{
			Name: row.PlayerName, RealmName: row.RealmName, PlayerClass: row.PlayerClass, GuildName: row.GuildName,
		}
	}
	return out, nil
}

// CareerLeader is one named subject at the top of a career board.
type CareerLeader struct {
	CareerBoardEntry
	CareerSubjectName
}

// CareerLeaders are the top of each career board for every realm.
type CareerLeaders struct {
	Status string
	// Boards are keyed by CareerBoardSorts.
	Boards map[string][]CareerLeader
}

// ReadCareerLeaders is the top `limit` of each career board over the given
// raids (every raid when empty), named.
func ReadCareerLeaders(ctx context.Context, store database.Store, tenant uuid.UUID, guilds bool, raids []leaderboardconfig.CareerKey, limit int) (CareerLeaders, error) {
	board, err := ReadCareerBoard(ctx, store, tenant, CareerBoardFilter{Guilds: guilds, Raids: raids})
	if err != nil {
		return CareerLeaders{}, err
	}
	out := CareerLeaders{Status: board.Status, Boards: map[string][]CareerLeader{}}
	var shown []CareerBoardEntry
	tops := map[string][]CareerBoardEntry{}
	for _, sort := range CareerBoardSorts {
		ranked := RankCareerBoard(board.Entries, sort)
		tops[sort] = ranked[:min(limit, len(ranked))]
		shown = append(shown, tops[sort]...)
	}
	ctx, err = careerReadContext(ctx, tenant)
	if err != nil {
		return CareerLeaders{}, err
	}
	names, err := CareerBoardNames(ctx, store, guilds, shown)
	if err != nil {
		return CareerLeaders{}, err
	}
	for _, sort := range CareerBoardSorts {
		for _, e := range tops[sort] {
			name := names[CareerSubjectKey{e.RealmID, e.SubjectID}]
			name.Name = cmp.Or(name.Name, e.SubjectID)
			name.PlayerClass = cmp.Or(e.PlayerClass, name.PlayerClass)
			out.Boards[sort] = append(out.Boards[sort], CareerLeader{CareerBoardEntry: e, CareerSubjectName: name})
		}
	}
	return out, nil
}
