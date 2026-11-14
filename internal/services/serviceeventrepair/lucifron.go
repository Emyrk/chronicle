package serviceeventrepair

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

const lucifronRuleVersion = "v1.0.173"

type lucifronPlan struct {
	Metrics []database.LucifronRepairRankingParams
}

type lucifronPlayerChange struct {
	EncounterID          uuid.UUID `json:"encounter_id"`
	PlayerGUID           string    `json:"player_guid"`
	PlayerName           string    `json:"player_name"`
	BeforeRankedDamage   int64     `json:"before_ranked_damage"`
	AfterRankedDamage    int64     `json:"after_ranked_damage"`
	BeforeUnrankedDamage int64     `json:"before_unranked_damage"`
	AfterUnrankedDamage  int64     `json:"after_unranked_damage"`
	BeforeDPS            float64   `json:"before_dps"`
	AfterDPS             float64   `json:"after_dps"`
}

func lucifronVersionEligible(version string) bool {
	_, eligible := parserVersionBefore(database.LogInstance{ParserVersion: version}, lucifronRuleVersion)
	return eligible
}

func lucifronParserVersion(instance database.LogInstance) (string, bool) {
	return parserVersionBefore(instance, lucifronRuleVersion)
}

func EvaluateLucifron(ctx context.Context, db database.Store, instanceID uuid.UUID) (*RepairPlan, error) {
	e, err := loadRepairEvidence(ctx, db, instanceID, false)
	if err != nil {
		return nil, err
	}
	// Evaluate metadata first. Only the specifically approved activity skip may
	// omit stream loading; every fallback retains the normal evidence path.
	p, err := evaluateLucifronEvidence(e)
	if err != nil {
		return nil, err
	}
	if p.Reason != lucifronActivitySkipReason {
		if !e.MissingInstance && e.Server.TenantID.Valid && e.Server.TenantID.UUID != uuid.Nil {
			e.Events, err = db.RazorgoreRepairEvents(ctx, instanceID)
			if err != nil {
				return nil, err
			}
		}
		p, err = evaluateLucifronEvidence(e)
		if err != nil {
			return nil, err
		}
	}
	p.operation = OperationLucifron
	p.seal, err = razorgorePlanSeal(p)
	return p, err
}

func RevalidateLucifron(ctx context.Context, db database.Store, p *RepairPlan) error {
	if p == nil || p.operation != OperationLucifron {
		return errors.New("missing Lucifron prepared payload")
	}
	if p.RequiresReparse && p.Reason == lucifronActivitySkipReason {
		if err := validateRazorgorePlan(p); err != nil {
			return err
		}
		e, err := loadRepairEvidence(ctx, db, p.InstanceID, false)
		if err != nil {
			return err
		}
		hash, err := razorgoreEvidenceHash(e)
		if err != nil {
			return err
		}
		if hash != p.EvidenceHash {
			return ErrStaleEvidence
		}
		return nil
	}
	return RevalidateRazorgore(ctx, db, p)
}

// The caller revalidates under the shared locked SERIALIZABLE transaction.
func ApplyLucifron(ctx context.Context, db database.Store, p *RepairPlan) error {
	if err := validateRazorgorePlan(p); err != nil {
		return err
	}
	if p.RequiresReparse || p.operation != OperationLucifron || p.lucifron == nil {
		return errors.New("lucifron plan is not executable")
	}
	for _, row := range p.lucifron.Metrics {
		n, err := db.LucifronRepairRanking(ctx, row)
		if err != nil {
			return err
		}
		if n != 1 {
			return ErrStaleEvidence
		}
	}
	return nil
}

func evaluateLucifronEvidence(e razorgoreEvidence) (*RepairPlan, error) {
	targets := instances.MoltenCoreDamageTargets(database.FlavorFromStrings(e.Group.Flavor))["Lucifron"].EntryIDs
	parserVersion, eligible := lucifronParserVersion(e.Instance)
	p := &RepairPlan{Warnings: []string{}, Changes: []string{}, InstanceID: e.Instance.ID, TenantID: e.Server.TenantID.UUID, Details: map[string]any{
		"parser_version": parserVersion, "rule_version": lucifronRuleVersion,
		"ranked_target_entries": slices.Clone(targets), "players": []lucifronPlayerChange{}, "omissions": []razorgoreOmission{},
	}}
	var err error
	p.EvidenceHash, err = razorgoreEvidenceHash(e)
	if err != nil {
		return nil, err
	}
	skip := func(reason string) (*RepairPlan, error) {
		p.RequiresReparse = true
		p.Reason = reason
		p.Changes = nil
		p.lucifron = nil
		return p, nil
	}
	if e.MissingInstance || e.Instance.Name != "Molten Core" || e.Instance.InvalidatedAt.Valid || !e.Server.TenantID.Valid || e.Server.TenantID.UUID == uuid.Nil || e.Realm.ID != e.Instance.RealmID || e.Server.ID != e.Realm.ServerID {
		return skip("missing or invalid Molten Core source identity")
	}
	if !eligible {
		return skip("parser version is unknown, ambiguous, or not strictly before " + lucifronRuleVersion)
	}
	for _, r := range e.Receipts {
		if r.Operation == OperationLucifron {
			return skip("Lucifron repair already recorded")
		}
	}
	if lucifronActivityOnlyTargets(e) {
		return skip(lucifronActivitySkipReason)
	}
	p.lucifron = &lucifronPlan{}
	found := false
	seen := map[uuid.UUID]bool{}
	for _, c := range e.Encounters {
		if c.Name != "Lucifron" {
			continue
		}
		if seen[c.ID] {
			return skip("duplicate Lucifron encounter")
		}
		seen[c.ID] = true
		if c.KillType != database.KillTypeClean {
			hasRankings := slices.ContainsFunc(e.Rankings, func(row database.EncounterDpsRanking) bool {
				return row.EncounterID.Valid && row.EncounterID.UUID == c.ID
			})
			if hasRankings {
				return skip("non-clean Lucifron encounter has unsupported source rankings")
			}
			continue // Wipes without source rankings are immutable and irrelevant.
		}
		found = true
		if err := evaluateLucifronEncounter(e, c, targets, p); err != nil {
			return skip(err.Error())
		}
	}
	if !found {
		return skip("no clean ranked Lucifron encounter")
	}
	p.Reason = "Lucifron ranked damage reconstructed from stored evidence"
	return p, nil
}

func evaluateLucifronEncounter(e razorgoreEvidence, c database.LogInstanceEncounter, targets []uint32, p *RepairPlan) error {
	if c.InstanceID != e.Instance.ID || !c.Boss || c.InvalidatedAt.Valid || c.KillType != database.KillTypeClean || !c.StartTime.Valid || !c.EndTime.Valid || !c.EndTime.Time.After(c.StartTime.Time) {
		return errors.New("lucifron requires complete clean encounter boundaries")
	}
	duration := c.EndTime.Time.Sub(c.StartTime.Time)
	if duration != time.Duration(duration.Milliseconds())*time.Millisecond || c.StartTime.Time.Nanosecond()%int(time.Millisecond) != 0 {
		return errors.New("sub-millisecond encounter precision cannot be reconstructed")
	}
	if c.RankingStartOffsetMs.Valid && c.RankingStartOffsetMs.Int64 != 0 || c.RankingEndOffsetMs.Valid && c.RankingEndOffsetMs.Int64 != duration.Milliseconds() {
		return errors.New("lucifron has an unsupported ranking window")
	}
	replay, err := lucifronEvents(e, c, p)
	if err != nil {
		return err
	}
	owners, err := lucifronRecordedOwners(replay, c.EndTime.Time, c.ID, p)
	if err != nil {
		return err
	}
	// Validate recorded control before replay. Player identity is unchanged by
	// possession: the parser credits direct player casters to themselves and
	// excludes player targets even while hostile. No controller receives their
	// damage. Unsupported creature control still cannot use this upper bound.
	if err := validateLucifronControl(e, c, replay); err != nil {
		return err
	}
	terminalUnowned := map[guid.GUID]bool{}
	for _, event := range replay {
		if m, ok := event.message.(*messages.UnitClassificationEvent); ok {
			if event.at.Equal(c.EndTime.Time) && m.Owner == nil {
				terminalUnowned[m.Target] = true
			}
		}
	}
	totals := map[guid.GUID]int64{}
	ranked := map[guid.GUID]int64{}
	uncertainCredit := false
	classified := map[guid.GUID]*messages.UnitClassificationEvent{}
	knownHostiles := instances.MoltenCoreHostiles()
	observedOwned := map[guid.GUID]bool{}
	for _, event := range replay {
		if m, ok := event.message.(*messages.UnitClassificationEvent); ok && m.Owner != nil {
			observedOwned[m.Target] = true
		}
	}
	for _, event := range replay {
		if snapshot, ok := event.message.(*messages.UnitClassificationEvent); ok {
			classified[snapshot.Target] = snapshot
			continue
		}
		m, ok := event.message.(*messages.Damage)
		if !ok {
			continue
		}
		if m.Amount < 0 || m.Overkill < 0 {
			return errors.New("negative damage evidence")
		}
		amount := int64(combatmetrics.EffectiveDamage(m))
		if amount <= 0 || m.Target.IsPlayer() {
			continue
		}
		// The parser never credits damage to a player-owned target. Use only
		// classification already observed at this damage index, not final state.
		if target, known := classified[m.Target]; known && target.Owner != nil && target.Owner.IsPlayer() {
			continue
		}
		if m.Caster == nil {
			return errors.New("environmental damage to nonplayers cannot establish credit")
		}
		player := *m.Caster
		if !player.IsPlayer() {
			owner, ok := owners[player]
			if !ok {
				entry, _ := player.GetEntry()
				if _, hostile := knownHostiles[entry]; hostile && !observedOwned[player] {
					// Registry hostiles such as Lucifron are not missing-owner
					// pets merely because activity ended before the final frame.
					continue
				}
				_, totem := totems.IsTotem(player)
				_, known := classified[player]
				if terminalUnowned[player] && !player.IsPet() && !totem {
					// An ordinary classified NPC is not a missing-owner pet.
					continue
				}
				reason := "unclassified source has no proven player attribution"
				if known {
					reason = "classified source has no proven encounter-terminal owner"
				}
				if player.IsPet() || totem {
					reason = "pet or totem has no proven encounter-terminal owner"
				}
				// Fight-end rollup cannot assign a pet whose explicit terminal
				// owner is nil. Its omitted contribution cannot offset an excluded
				// direct-player term. Missing terminal evidence has no such proof.
				if !terminalUnowned[player] {
					uncertainCredit = true
				} else {
					reason = "explicit encounter-terminal snapshot has no owner; excluded from player rollup"
				}
				recordRazorgoreOmission(p, c.ID, "damage", player, amount, reason)
				continue
			}
			player = owner
		}
		if totals[player] > math.MaxInt64-amount {
			return errors.New("damage total overflow")
		}
		totals[player] += amount
		entry, _ := m.Target.GetEntry()
		if slices.Contains(targets, entry) {
			ranked[player] += amount
		}
	}
	// An unattributed source could offset an excluded direct-player term. Equal
	// sums alone cannot prove which terms were credited in that mixed case.
	if uncertainCredit && len(totals) > 0 {
		return errors.New("uncertain nonplayer credits prevent direct-player upper-bound proof")
	}
	rows := map[guid.GUID]bool{}
	for _, row := range e.Rankings {
		if !row.EncounterID.Valid || row.EncounterID.UUID != c.ID {
			continue
		}
		player, err := guid.FromString(row.PlayerGuid)
		if err != nil || !player.IsPlayer() || player.IsZero() || rows[player] || row.InstanceID != e.Instance.ID || row.EncounterName != "Lucifron" || row.InstanceName != "Molten Core" {
			return errors.New("invalid or duplicate Lucifron ranking identity")
		}
		rows[player] = true
		if row.DamageDone < 0 || row.UnrankedDamageDone < 0 || row.DamageDone > math.MaxInt64-row.UnrankedDamageDone || row.DamageDone+row.UnrankedDamageDone != totals[player] {
			return errors.New("full damage upper bound does not reconcile to persisted player credit")
		}
		if row.DurationSecs <= 0 || math.IsNaN(row.DurationSecs) || math.IsInf(row.DurationSecs, 0) || row.DurationSecs != duration.Seconds() {
			return errors.New("lucifron source duration does not match encounter")
		}
		after := ranked[player]
		unranked := totals[player] - after
		dps := float64(after) / row.DurationSecs
		if math.IsNaN(row.Dps) || math.IsInf(row.Dps, 0) {
			return errors.New("invalid persisted DPS")
		}
		p.Details["players"] = append(p.Details["players"].([]lucifronPlayerChange), lucifronPlayerChange{c.ID, row.PlayerGuid, row.PlayerName, row.DamageDone, after, row.UnrankedDamageDone, unranked, row.Dps, dps})
		if row.DamageDone != after || row.UnrankedDamageDone != unranked || row.Dps != dps {
			p.lucifron.Metrics = append(p.lucifron.Metrics, database.LucifronRepairRankingParams{ID: row.ID, InstanceID: e.Instance.ID, EncounterID: c.ID, DamageDone: after, UnrankedDamageDone: unranked, Dps: dps})
			p.Changes = append(p.Changes, fmt.Sprintf("correct Lucifron ranked damage for %s in %s", row.PlayerGuid, c.ID))
		}
	}
	if len(rows) == 0 {
		return errors.New("missing Lucifron source rankings")
	}
	for player := range totals {
		if !rows[player] {
			return errors.New("event player missing Lucifron source ranking")
		}
	}
	return nil
}
