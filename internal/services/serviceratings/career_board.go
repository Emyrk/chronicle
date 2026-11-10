package serviceratings

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
)

// CareerBoardEntry is one character on the overall career board. Mastery and
// Peak come from the character's spec with the highest Mastery; Renown is the
// sum across every spec, since each kill belongs to exactly one spec.
type CareerBoardEntry struct {
	RealmID       uuid.UUID
	PlayerGUID    string
	PlayerClass   string
	PlayerSpec    string
	PlayerSubSpec string
	ChosenMetric  *string
	Mastery       *float64
	Peak          *float64
	Renown        float64
}

type CareerBoard struct {
	// Status is "ready" or why Mastery and Peak are unavailable; Renown is
	// published regardless.
	Status  string
	Entries []CareerBoardEntry
}

// ReadCareerBoard reduces every published player career row with the current
// weights and combines each character's specs. It computes on every call;
// callers cache the response at the edge.
func ReadCareerBoard(ctx context.Context, store database.Store, tenant, realm uuid.UUID) (CareerBoard, error) {
	ctx, err := careerReadContext(ctx, tenant)
	if err != nil {
		return CareerBoard{}, err
	}
	var out CareerBoard
	err = store.InTx(ctx, func(tx database.Store) error {
		if err := requirePlayerCareerMode(ctx, tx, tenant); err != nil {
			return err
		}
		pool, err := CareerConfiguration(ctx, tx, tenant)
		if err != nil {
			return err
		}
		out.Status = "ready"
		if !pool.AveragesReady() {
			out.Status = ReduceCareer(pool, CareerInputs{}, "").PerformanceStatus
		}
		rows, err := tx.ListLeaderboardCareerPlayerSubjects(ctx, database.ListLeaderboardCareerPlayerSubjectsParams{TenantID: tenant, RealmFilter: realm})
		if err != nil {
			return err
		}
		out.Entries, err = combineCareerBoard(pool, rows)
		return err
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	return out, err
}

// combineCareerBoard folds per-spec rows into one entry per character, in
// first-seen order. Rows arrive sorted by character.
func combineCareerBoard(pool leaderboardconfig.CareerPool, rows []database.LeaderboardCareerSubject) ([]CareerBoardEntry, error) {
	type character struct {
		entry      CareerBoardEntry
		bestRenown float64
		hasBest    bool
	}
	var out []CareerBoardEntry
	var current *character
	flush := func() {
		if current != nil && (current.hasBest || current.entry.Renown > 0) {
			out = append(out, current.entry)
		}
	}
	for _, row := range rows {
		summary, err := careerStoredSummary(pool, row)
		if err != nil {
			return nil, err
		}
		if current == nil || current.entry.RealmID != row.RealmID || current.entry.PlayerGUID != row.SubjectID {
			flush()
			current = &character{entry: CareerBoardEntry{RealmID: row.RealmID, PlayerGUID: row.SubjectID, PlayerClass: row.PlayerClass}}
		}
		current.entry.Renown += summary.Renown
		if !careerBoardBetter(summary, row.PlayerSpec, current.hasBest, current.entry.Mastery, current.bestRenown) {
			continue
		}
		current.hasBest = true
		current.bestRenown = summary.Renown
		current.entry.PlayerClass = row.PlayerClass
		current.entry.PlayerSpec = row.PlayerSpec
		current.entry.PlayerSubSpec = row.PlayerSubSpec
		current.entry.ChosenMetric = summary.ChosenMetric
		current.entry.Mastery = summary.Mastery
		current.entry.Peak = summary.Peak
	}
	flush()
	return out, nil
}

// careerBoardBetter reports whether a spec beats the character's current best:
// higher Mastery, then more Renown. Specs without Mastery and Unknown specs
// never qualify.
func careerBoardBetter(candidate CareerSummary, spec string, hasBest bool, bestMastery *float64, bestRenown float64) bool {
	if candidate.Mastery == nil || spec == "" || spec == "Unknown" {
		return false
	}
	if !hasBest {
		return true
	}
	if *candidate.Mastery != *bestMastery {
		return *candidate.Mastery > *bestMastery
	}
	return candidate.Renown > bestRenown
}
