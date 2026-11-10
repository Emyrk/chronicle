package serviceratings

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
)

// CareerBoardFilter scopes the overall career board.
type CareerBoardFilter struct {
	Realm uuid.UUID
	// Guilds ranks guilds (kill-time Mastery and Peak) instead of characters.
	Guilds bool
	// Metric is "" for each spec's chosen metric, or "dps"/"hps" to score every
	// spec with that metric. Characters only.
	Metric string
	// Class, Spec, and SubSpec narrow characters. A spec filter takes Mastery and
	// Peak from that spec; Renown still adds up every spec.
	Class, Spec, SubSpec string
	// Raids narrows the board to these raids: Mastery and Peak become the
	// weighted average over them alone, and Renown sums only them. Empty means
	// every raid.
	Raids []leaderboardconfig.CareerKey
}

// CareerRaidOption is one raid a career board can be narrowed to.
type CareerRaidOption struct {
	leaderboardconfig.CareerKey
	// Weight is nil for raids that only count toward Renown.
	Weight         *float64
	IncludeAverage bool
	IncludeRenown  bool
}

// CareerBoardEntry is one character or guild on the overall career board.
// For characters, Mastery and Peak come from the spec with the highest Mastery
// (or the filtered spec); Renown is the sum across every spec, since each kill
// belongs to exactly one spec.
type CareerBoardEntry struct {
	RealmID       uuid.UUID
	SubjectID     string
	PlayerClass   string
	PlayerSpec    string
	PlayerSubSpec string
	ChosenMetric  *string
	Mastery       *float64
	Peak          *float64
	Form          *float64
	Floor         *float64
	Renown        float64
	// Contributions are the per-raid values behind Mastery and Peak.
	Contributions []CareerContribution
}

type CareerBoard struct {
	// Status is "ready" or why Mastery and Peak are unavailable; Renown is
	// published regardless.
	Status  string
	Entries []CareerBoardEntry
	// Raids are every raid the board can be narrowed to, whatever the filter,
	// heaviest first.
	Raids []CareerRaidOption
}

// careerRaidOptions lists the pool's active raids, heaviest first.
func careerRaidOptions(pool leaderboardconfig.CareerPool) []CareerRaidOption {
	var out []CareerRaidOption
	for _, v := range pool.Variants {
		if v.Active && (v.IncludeAverage || v.IncludeRenown) {
			out = append(out, CareerRaidOption{CareerKey: v.CareerKey, Weight: v.Weight, IncludeAverage: v.IncludeAverage, IncludeRenown: v.IncludeRenown})
		}
	}
	weight := func(o CareerRaidOption) float64 {
		if o.Weight == nil || !o.IncludeAverage {
			return 0
		}
		return *o.Weight
	}
	slices.SortStableFunc(out, func(a, b CareerRaidOption) int {
		return cmp.Or(cmp.Compare(weight(b), weight(a)), cmp.Compare(a.Instance, b.Instance), cmp.Compare(a.Difficulty, b.Difficulty), cmp.Compare(a.MaxPlayers, b.MaxPlayers))
	})
	return out
}

// restrictCareerPool deactivates every raid outside the selection, so the
// reducer's weighted denominator covers only the selected raids. Issues are
// kept: a configuration problem still blocks averages rather than quietly
// leaving a raid out.
func restrictCareerPool(pool leaderboardconfig.CareerPool, raids []leaderboardconfig.CareerKey) leaderboardconfig.CareerPool {
	if len(raids) == 0 {
		return pool
	}
	keep := make(map[leaderboardconfig.CareerKey]bool, len(raids))
	for _, k := range raids {
		keep[k] = true
	}
	variants := slices.Clone(pool.Variants)
	for i := range variants {
		if !keep[variants[i].CareerKey] {
			variants[i].Active = false
		}
	}
	pool.Variants = variants
	return pool
}

// ReadCareerBoard reduces every published career row with the current weights
// and combines each character's specs. It computes on every call; callers
// cache the response at the edge.
func ReadCareerBoard(ctx context.Context, store database.Store, tenant uuid.UUID, filter CareerBoardFilter) (CareerBoard, error) {
	if filter.Metric != "" && filter.Metric != "dps" && filter.Metric != "hps" {
		return CareerBoard{}, fmt.Errorf("unknown career metric %q", filter.Metric)
	}
	ctx, err := careerReadContext(ctx, tenant)
	if err != nil {
		return CareerBoard{}, err
	}
	var out CareerBoard
	err = store.InTx(ctx, func(tx database.Store) error {
		if !filter.Guilds {
			if err := requirePlayerCareerMode(ctx, tx, tenant); err != nil {
				return err
			}
		}
		pool, err := CareerConfiguration(ctx, tx, tenant)
		if err != nil {
			return err
		}
		out.Raids = careerRaidOptions(pool)
		pool = restrictCareerPool(pool, filter.Raids)
		out.Status = "ready"
		if !pool.AveragesReady() {
			out.Status = ReduceCareer(pool, CareerInputs{}, "").PerformanceStatus
		}
		kind, class := "player", filter.Class
		if filter.Guilds {
			kind, class = "guild", ""
		}
		rows, err := tx.ListLeaderboardCareerSubjects(ctx, database.ListLeaderboardCareerSubjectsParams{
			TenantID: tenant, SubjectKind: kind, RealmFilter: filter.Realm, PlayerClass: class,
		})
		if err != nil {
			return err
		}
		out.Entries, err = combineCareerBoard(pool, rows, filter)
		return err
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	return out, err
}

// careerBoardSummary scores one stored row: with its chosen metric, or with a
// forced DPS/HPS metric when the board asks for one.
func careerBoardSummary(pool leaderboardconfig.CareerPool, row database.LeaderboardCareerSubject, metric string) (CareerSummary, error) {
	if metric == "" || row.SubjectKind == "guild" {
		return careerStoredSummary(pool, row)
	}
	var inputs CareerInputs
	if err := json.Unmarshal(row.Inputs, &inputs); err != nil {
		return CareerSummary{}, fmt.Errorf("decode career inputs: %w", err)
	}
	return ReduceCareer(pool, inputs, metric), nil
}

// combineCareerBoard folds per-spec rows into one entry per subject, in
// first-seen order. Rows arrive sorted by subject.
func combineCareerBoard(pool leaderboardconfig.CareerPool, rows []database.LeaderboardCareerSubject, filter CareerBoardFilter) ([]CareerBoardEntry, error) {
	type subject struct {
		entry      CareerBoardEntry
		bestRenown float64
		hasBest    bool
		// matched is true once a row passes the spec filter.
		matched bool
	}
	var out []CareerBoardEntry
	var current *subject
	flush := func() {
		if current != nil && current.matched && (current.hasBest || current.entry.Renown > 0) {
			out = append(out, current.entry)
		}
	}
	for _, row := range rows {
		summary, err := careerBoardSummary(pool, row, filter.Metric)
		if err != nil {
			return nil, err
		}
		if current == nil || current.entry.RealmID != row.RealmID || current.entry.SubjectID != row.SubjectID {
			flush()
			current = &subject{entry: CareerBoardEntry{RealmID: row.RealmID, SubjectID: row.SubjectID, PlayerClass: row.PlayerClass}}
		}
		current.entry.Renown += summary.Renown
		if (filter.Spec != "" && row.PlayerSpec != filter.Spec) || (filter.SubSpec != "" && row.PlayerSubSpec != filter.SubSpec) {
			continue
		}
		current.matched = true
		guild := row.SubjectKind == "guild"
		if !careerBoardBetter(summary, row.PlayerSpec, guild, current.hasBest, current.entry.Mastery, current.bestRenown) {
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
		current.entry.Form, current.entry.Floor = summary.Form, summary.Floor
		current.entry.Contributions = summary.Contributions
	}
	flush()
	return out, nil
}

// careerBoardBetter reports whether a row beats the subject's current best:
// higher Mastery, then more Renown. Rows without Mastery never qualify, nor do
// a character's Unknown specs. Guild rows have no spec.
func careerBoardBetter(candidate CareerSummary, spec string, guild, hasBest bool, bestMastery *float64, bestRenown float64) bool {
	if candidate.Mastery == nil || (!guild && (spec == "" || spec == "Unknown")) {
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
