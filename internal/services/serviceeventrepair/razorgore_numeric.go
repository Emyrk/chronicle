package serviceeventrepair

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

type razorgoreNumericPlan struct {
	Window  database.RazorgoreRepairRankingWindowParams
	Metrics []database.RazorgoreRepairMetricsParams
}

type razorgoreReplayEvent struct {
	index   int32
	at      time.Time
	message messages.Message
}

// evaluateRazorgoreNumeric deliberately does not guess historical affiliation.
// For direct-player sources, every possible credited damage event is a
// nonnegative term in an upper bound. Equality with the persisted full credited
// damage proves all these events were credited, independent of missing UNIT_INFO
// or possession expiry. Pet/creature sources could offset excluded terms and are
// therefore rejected, even when a snapshot replay happens to match the sum.
func evaluateRazorgoreNumeric(e razorgoreEvidence, p *RazorgoreRepairPlan) error {
	if len(e.Encounters) != 1 {
		return errors.New("numerical repair currently requires a single encounter; speedrun replay is ambiguous")
	}
	c := e.Encounters[0]
	if c.Name != "Razorgore the Untamed" || !c.Boss || c.KillType != database.KillTypeClean || c.InvalidatedAt.Valid || len(c.Remaining) != 0 || !c.StartTime.Valid || !c.EndTime.Valid || !c.EndTime.Time.After(c.StartTime.Time) {
		return errors.New("numerical repair requires a complete clean Razorgore kill")
	}
	start, end := c.StartTime.Time, c.EndTime.Time
	duration := end.Sub(start).Milliseconds()
	if end.Sub(start) != time.Duration(duration)*time.Millisecond {
		return errors.New("sub-millisecond encounter precision cannot be reconstructed")
	}
	phases := append([]database.LogInstanceEncounterPhase(nil), e.Phases...)
	slices.SortFunc(phases, func(a, b database.LogInstanceEncounterPhase) int { return int(a.PhaseOrder - b.PhaseOrder) })
	if len(phases) != 2 || phases[0].EncounterID != c.ID || phases[1].EncounterID != c.ID || phases[0].Key != "razorgore_p1" || phases[1].Key != "razorgore_p2" || phases[0].PhaseOrder != 0 || phases[1].PhaseOrder != 1 || phases[0].StartOffsetMs != 0 || phases[0].EndOffsetMs != phases[1].StartOffsetMs || phases[1].EndOffsetMs != duration || phases[1].StartOffsetMs <= 0 || phases[1].StartOffsetMs >= duration || phases[0].KillType != database.KillTypeClean || phases[1].KillType != database.KillTypeClean {
		return errors.New("numerical repair needs two complete contiguous clean persisted phases")
	}
	window := &encounter.RankingWindow{Start: start.Add(time.Duration(phases[1].StartOffsetMs) * time.Millisecond), End: end}
	var boss guid.GUID
	for _, h := range e.Hostiles {
		if h.EncounterID != c.ID || len(h.Periods) == 0 {
			return errors.New("missing or unrelated hostile periods")
		}
		last := h.Periods[len(h.Periods)-1]
		if last.EndState != database.EndStateSlain || last.End == nil {
			return errors.New("unresolved hostile periods require reparse")
		}
		entry, _ := h.ID.GetEntry()
		if h.Boss {
			if entry != 12435 || boss != 0 || len(h.Periods) != 1 || h.Periods[0].Start == nil || !h.Periods[0].Start.Timestamp.Equal(start) || !last.End.Timestamp.Equal(end) {
				return errors.New("ambiguous boss death/period boundaries")
			}
			boss = h.ID
		}
	}
	if boss == 0 {
		return errors.New("missing boss activity")
	}
	if err := validateRazorgoreNumericSpeedrun(e, c, boss); err != nil {
		return err
	}
	replay, err := razorgoreNumericEvents(e, c)
	if err != nil {
		return err
	}
	petOwners, err := razorgoreProvenPetOwners(replay, end)
	if err != nil {
		return err
	}
	units := unitdb.New()
	tracker := rankings.NewDPSTracker(units, nil, rankings.DamageRuleNone)
	life := rankings.NewSurvivabilityTracker()
	tracker.FightStarted(c.ID, nil)
	life.FightStarted(c.ID, nil)
	var damage []*messages.Damage
	bossDeaths := 0
	for _, event := range replay {
		switch m := event.message.(type) {
		case *messages.Damage:
			if m.Amount < 0 || m.Overkill < 0 {
				return errors.New("negative damage cannot be reconciled")
			}
			amount := combatmetrics.EffectiveDamage(m)
			if amount <= 0 {
				continue
			}
			units.Info[m.Target] = unitinfo.Info{Guid: m.Target, IsPlayer: m.Target.IsPlayer(), CanCooperate: m.Target.IsPlayer()}
			if !m.Target.IsPlayer() {
				if m.Caster == nil {
					return errors.New("environmental damage to nonplayers cannot establish credit")
				}
				if !m.Caster.IsPlayer() {
					owner, ok := petOwners[*m.Caster]
					if !ok {
						return errors.New("non-player damage source lacks proven terminal ownership or has possession ambiguity")
					}
					units.Info[*m.Caster] = unitinfo.Info{Guid: *m.Caster, Owner: &owner, CanCooperate: true}
				}
			}
			if m.Caster != nil && m.Caster.IsPlayer() {
				units.Info[*m.Caster] = unitinfo.Info{Guid: *m.Caster, IsPlayer: true, CanCooperate: true}
			}
			damage = append(damage, m)
		case *messages.Heal:
			if m.Amount < 0 || m.Overheal < 0 {
				return errors.New("negative healing cannot be reconciled")
			}
			if !m.Caster.IsPlayer() || !m.Target.IsPlayer() {
				return errors.New("non-player healing requires historical ownership replay")
			}
			units.Info[m.Caster] = unitinfo.Info{Guid: m.Caster, IsPlayer: true, CanCooperate: true}
			units.Info[m.Target] = unitinfo.Info{Guid: m.Target, IsPlayer: true, CanCooperate: true}
		case *messages.Absorbed:
			if m.Amount < 0 || !m.Caster.IsPlayer() || !m.Target.IsPlayer() {
				return errors.New("non-player or invalid absorbs require historical ownership replay")
			}
			units.Info[m.Caster] = unitinfo.Info{Guid: m.Caster, IsPlayer: true, CanCooperate: true}
			units.Info[m.Target] = unitinfo.Info{Guid: m.Target, IsPlayer: true, CanCooperate: true}
		case *messages.UnitClassificationEvent:
			// Snapshots share the global event index with combat streams. They
			// establish source ownership, not assumed perpetual affiliation.
			// Candidate targets are deliberately an upper bound below.
			info := units.Info[m.Target]
			info.Guid = m.Target
			info.Owner = m.Owner
			info.Affiliation = m.Affiliation
			units.Info[m.Target] = info
		case *messages.Slain:
			if m.Victim == boss {
				if !event.at.Equal(end) {
					return errors.New("boss death does not match terminal boundary")
				}
				bossDeaths++
			}
		}
		if err := tracker.ProcessMessage(true, c.ID, event.message); err != nil {
			return err
		}
		if err := life.ProcessMessage(true, c.ID, event.message); err != nil {
			return err
		}
	}
	if bossDeaths != 1 {
		return errors.New("requires one explicit phase-two terminal boss death")
	}
	for pet, owner := range petOwners {
		info := units.Info[pet]
		copyOwner := owner
		info.Owner = &copyOwner
		units.Info[pet] = info
	}
	tracker.FightEnded(c.ID, nil)
	result := razorgoreMergePetDamage(tracker.Result()[c.ID])
	rows := make(map[guid.GUID]database.EncounterDpsRanking)
	fullHealing := make(map[guid.GUID][2]int64)
	for _, row := range e.Rankings {
		if !row.EncounterID.Valid || row.EncounterID.UUID != c.ID {
			return errors.New("other ranking sources require full instance replay")
		}
		id, err := guid.FromString(row.PlayerGuid)
		if err != nil || !id.IsPlayer() || id.IsZero() {
			return errors.New("invalid source player identity")
		}
		if _, exists := rows[id]; exists {
			return errors.New("duplicate source ranking player")
		}
		stats := result.Units[id]
		if stats == nil || !stats.IsPlayer || row.DamageDone < 0 || row.UnrankedDamageDone < 0 || row.DamageDone > math.MaxInt64-row.UnrankedDamageDone || stats.DamageDone != row.DamageDone+row.UnrankedDamageDone {
			return errors.New("full direct-player damage upper bound does not reconcile to source credits")
		}
		rows[id] = row
		fullHealing[id] = [2]int64{stats.HealingDone, stats.HealingAbsorbed}
	}
	if len(rows) == 0 {
		return errors.New("missing source metric rows")
	}
	for id, stats := range result.Units {
		if stats.IsPlayer {
			if _, ok := rows[id]; !ok {
				return errors.New("event player missing from source metrics")
			}
		}
	}
	for _, m := range damage {
		tracker.ClassifyDamage(c.ID, rankings.DamageTargets{Mode: rankings.DamageTargetsEntries, EntryIDs: []uint32{12435}}, m, window)
	}
	tracker.ClassifyHealing(c.ID, window)
	tracker.FinishDamageClassification(c.ID)
	result = razorgoreMergePetDamage(tracker.Result()[c.ID])
	life.FightFinalized(c.ID, window.Start, window.End)
	roleMetrics := make(map[guid.GUID]wowspec.PlayerMetrics)
	for id, row := range rows {
		stats := result.Units[id]
		roleMetrics[id] = wowspec.PlayerMetrics{DamageDone: stats.RankedDamageDone, DamageTaken: stats.DamageTaken, HealingDone: stats.HealingDone + stats.HealingAbsorbed, Class: row.PlayerClass, Spec: row.PlayerSpec}
	}
	roles := wowspec.InferRoles(roleMetrics)
	n := &razorgoreNumericPlan{Window: database.RazorgoreRepairRankingWindowParams{EncounterID: c.ID, InstanceID: c.InstanceID, StartMs: pgtype.Int8{Int64: phases[1].StartOffsetMs, Valid: true}, EndMs: pgtype.Int8{Int64: duration, Valid: true}}}
	for _, row := range e.Rankings {
		id, _ := guid.FromString(row.PlayerGuid)
		stats := result.Units[id]
		// Accept original full-fight HPS sources or already phase-windowed sources.
		// Direct-player targeting proves attribution; this additionally rejects lost
		// healing/absorb streams rather than silently replacing totals with zero.
		full := fullHealing[id]
		if (row.HealingDone != full[0] || row.AbsorbedDone != full[1]) && (row.HealingDone != stats.HealingDone || row.AbsorbedDone != stats.HealingAbsorbed) {
			return errors.New("healing/absorb stream totals do not reconcile to source metrics")
		}
		survival := rankings.PlayerSurvivability{AlivePercentage: 100}
		if value, ok := life.Result()[c.ID].Players[id]; ok {
			survival = value
		}
		secs := window.End.Sub(window.Start).Seconds()
		update := database.RazorgoreRepairMetricsParams{ID: row.ID, InstanceID: c.InstanceID, EncounterID: row.EncounterID, DamageDone: stats.RankedDamageDone, UnrankedDamageDone: stats.UnrankedDamageDone, HealingDone: stats.HealingDone, AbsorbedDone: stats.HealingAbsorbed, DurationSecs: secs, Dps: float64(stats.RankedDamageDone) / secs, Hps: float64(stats.HealingDone+stats.HealingAbsorbed) / secs, PlayerRole: roles[id], PlayerDeaths: pgtype.Int4{Int32: survival.Deaths, Valid: true}, AlivePercentage: pgtype.Float8{Float64: survival.AlivePercentage, Valid: true}}
		if !razorgoreMetricsEqual(row, update) {
			n.Metrics = append(n.Metrics, update)
		}
	}
	p.EncounterID = c.ID
	p.Outcome = c.KillType
	p.numeric = n
	if c.RankingStartOffsetMs != n.Window.StartMs || c.RankingEndOffsetMs != n.Window.EndMs {
		p.Changes = append(p.Changes, "set proven phase-two ranking window")
	}
	if len(n.Metrics) > 0 {
		p.Changes = append(p.Changes, "repair direct-player phase-two source metrics and survivability")
	}
	p.Reason = "phase-two direct-player credits proven by full-damage upper-bound reconciliation; original speedrun timing verified"
	return nil
}

func razorgoreMetricsEqual(r database.EncounterDpsRanking, p database.RazorgoreRepairMetricsParams) bool {
	return r.DamageDone == p.DamageDone && r.UnrankedDamageDone == p.UnrankedDamageDone && r.HealingDone == p.HealingDone && r.AbsorbedDone == p.AbsorbedDone && r.DurationSecs == p.DurationSecs && r.Dps == p.Dps && r.Hps == p.Hps && r.PlayerRole == p.PlayerRole && r.PlayerDeaths == p.PlayerDeaths && r.AlivePercentage == p.AlivePercentage
}

func applyRazorgoreNumeric(ctx context.Context, tx database.Store, n *razorgoreNumericPlan) error {
	if err := tx.RazorgoreRepairRankingWindow(ctx, n.Window); err != nil {
		return err
	}
	for _, m := range n.Metrics {
		if err := tx.RazorgoreRepairMetrics(ctx, m); err != nil {
			return err
		}
	}
	return nil
}

// The supported one-encounter run remains incomplete and retains the original
// full-encounter speedrun timing, never the shorter P2 DPS/HPS denominator. We
// require proof/timings already to agree; wider proof repair is not guessed.
func validateRazorgoreNumericSpeedrun(e razorgoreEvidence, c database.LogInstanceEncounter, boss guid.GUID) error {
	if len(e.Speedruns) != 1 || e.Instance.MixedDifficulty {
		return errors.New("missing or ambiguous speedrun source")
	}
	s := e.Speedruns[0]
	start, end := c.StartTime, c.EndTime
	ms := end.Time.Sub(start.Time).Milliseconds()
	if s.InstanceID != c.InstanceID || s.RealmID != e.Instance.RealmID || s.Qualified || !s.StartTime.Valid || !s.StartTime.Time.Equal(start.Time) || !s.CompletionTime.Valid || !s.CompletionTime.Time.Equal(end.Time) || s.DurationMs != ms || !s.RankedStartTime.Valid || !s.RankedStartTime.Time.Equal(start.Time) || !s.RankedCompletionTime.Valid || !s.RankedCompletionTime.Time.Equal(end.Time) || !s.RankedDurationMs.Valid || s.RankedDurationMs.Int64 != ms || !s.BossToBossStartTime.Valid || !s.BossToBossStartTime.Time.Equal(start.Time) || !s.BossToBossCompletionTime.Valid || !s.BossToBossCompletionTime.Time.Equal(end.Time) || !s.BossToBossDurationMs.Valid || s.BossToBossDurationMs.Int64 != ms {
		return errors.New("speedrun timing cannot be proven to retain original encounter boundaries")
	}
	var payload rankings.SpeedrunProofPayload
	if err := json.Unmarshal(s.Proof, &payload); err != nil {
		return errors.New("unrecognized speedrun proof")
	}
	required := map[uint32]bool{12435: false, 13020: false, 12017: false, 11983: false, 14601: false, 11981: false, 14020: false, 11583: false}
	seen := map[uint32]bool{}
	for _, proof := range payload.Proof {
		if len(proof.Requirement.EntryIDs) != 1 || proof.Requirement.Count != 1 || proof.Requirement.Category != rankings.SpeedrunCategoryBosses {
			return errors.New("unsupported speedrun requirement")
		}
		entry := proof.Requirement.EntryIDs[0]
		if seen[entry] {
			return errors.New("duplicate speedrun requirement")
		}
		seen[entry] = true
		if _, ok := required[entry]; ok {
			required[entry] = true
		} else if entry != 65148 && entry != 14401 {
			return errors.New("unknown speedrun requirement")
		}
		if entry == 12435 {
			if !proof.Satisfied || len(proof.Kills) != 1 || proof.Kills[0].EntryID != entry || proof.Kills[0].GUID != boss || !proof.Kills[0].Timestamp.Equal(end.Time) {
				return errors.New("razorgore proof contradicts terminal death")
			}
		} else if proof.Satisfied || len(proof.Kills) != 0 {
			return errors.New("unrelated boss proof requires full replay")
		}
	}
	for _, found := range required {
		if !found {
			return errors.New("incomplete speedrun requirements")
		}
	}
	return nil
}

func razorgoreNumericEvents(e razorgoreEvidence, c database.LogInstanceEncounter) ([]razorgoreReplayEvent, error) {
	streams := map[database.LogInstanceEventType]func() proto.Message{
		database.LogInstanceEventTypeDamage:       func() proto.Message { return &chronicleproto.Damage{} },
		database.LogInstanceEventTypeHeal:         func() proto.Message { return &chronicleproto.Heal{} },
		database.LogInstanceEventTypeAbsorbed:     func() proto.Message { return &chronicleproto.Absorbed{} },
		database.LogInstanceEventTypeSlain:        func() proto.Message { return &chronicleproto.Slain{} },
		database.LogInstanceEventTypeRessurection: func() proto.Message { return &chronicleproto.Resurrection{} },
	}
	streams[database.LogInstanceEventTypeUnitClassification] = func() proto.Message { return &chronicleproto.UnitClassification{} }
	var result []razorgoreReplayEvent
	seen := map[database.LogInstanceEventType]bool{}
	for _, row := range e.Events {
		factory, ok := streams[row.Type]
		if !ok {
			continue
		}
		if seen[row.Type] {
			return nil, errors.New("duplicate event stream")
		}
		seen[row.Type] = true
		raw, err := razorgoreFrame(row.Events, c.ID, c.StartTime.Time)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", row.Type, err)
		}
		for _, b := range raw {
			event := factory()
			if err := proto.Unmarshal(b, event); err != nil {
				return nil, err
			}
			meta := event.(interface {
				GetMeta() *chronicleproto.EventMeta
			}).GetMeta()
			if meta == nil || (meta.IsSynthetic && row.Type != database.LogInstanceEventTypeAbsorbed && row.Type != database.LogInstanceEventTypeRessurection) || meta.Index < 0 || meta.OffsetMilli < 0 || meta.OffsetMilli > c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds() {
				return nil, errors.New("invalid or synthetic numerical event metadata")
			}
			at := c.StartTime.Time.Add(time.Duration(meta.OffsetMilli) * time.Millisecond)
			base := messages.Base(at)
			parse := func(s string) (guid.GUID, error) {
				g, err := guid.FromString(s)
				if err != nil || g.IsZero() {
					return 0, errors.New("invalid event GUID")
				}
				return g, nil
			}
			var message messages.Message
			switch m := event.(type) {
			case *chronicleproto.Damage:
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				dmg := &messages.Damage{MessageBase: base, Target: target, Amount: m.Amount, Overkill: m.Overkill, HitType: types.HitType(m.HitType)}
				if m.Caster != nil {
					caster, err := parse(*m.Caster)
					if err != nil {
						return nil, err
					}
					dmg.Caster = &caster
				}
				for _, tail := range m.Tailers {
					if tail == nil {
						return nil, errors.New("nil damage trailer")
					}
					dmg.Trailer = append(dmg.Trailer, types.TrailerEntry{Amount: tail.Amount, HitType: types.HitType(tail.HitType)})
				}
				message = dmg
			case *chronicleproto.Heal:
				caster, err := parse(m.Caster)
				if err != nil {
					return nil, err
				}
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				message = &messages.Heal{MessageBase: base, Caster: caster, Target: target, Amount: m.Amount, Overheal: m.Overheal}
			case *chronicleproto.Absorbed:
				caster, err := parse(m.Caster)
				if err != nil {
					return nil, err
				}
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				message = &messages.Absorbed{MessageBase: base, Caster: caster, Target: target, Amount: m.Amount}
			case *chronicleproto.UnitClassification:
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				classification := &messages.UnitClassificationEvent{MessageBase: base, Target: target, UnitType: unitdb.UnitType(m.UnitType), Affiliation: unitdb.Affiliation(m.Affiliation)}
				if m.Owner != nil {
					owner, err := parse(*m.Owner)
					if err != nil {
						return nil, err
					}
					classification.Owner = &owner
				}
				if m.Controller != nil {
					controller, err := parse(*m.Controller)
					if err != nil {
						return nil, err
					}
					classification.Controller = &controller
				}
				message = classification
			case *chronicleproto.Slain:
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				message = &messages.Slain{MessageBase: base, Victim: target}
			case *chronicleproto.Resurrection:
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				message = &messages.Resurrection{MessageBase: base, Target: target}
			}
			result = append(result, razorgoreReplayEvent{index: meta.Index, at: at, message: message})
		}
	}
	for kind := range streams {
		if kind == database.LogInstanceEventTypeUnitClassification {
			continue
		}
		if !seen[kind] {
			return nil, fmt.Errorf("missing %s stream (empty must be explicit)", kind)
		}
	}
	slices.SortFunc(result, func(a, b razorgoreReplayEvent) int {
		if a.index < b.index {
			return -1
		}
		if a.index > b.index {
			return 1
		}
		return 0
	})
	for i := 1; i < len(result); i++ {
		if result[i].index == result[i-1].index || result[i].at.Before(result[i-1].at) {
			return nil, errors.New("ambiguous event index/time ordering")
		}
	}
	return result, nil
}

func razorgoreFrame(compressed []byte, id uuid.UUID, start time.Time) ([][]byte, error) {
	const maxBytes = 256 << 20
	z, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, err
	}
	defer func() { _ = z.Close() }()
	data, err := io.ReadAll(io.LimitReader(z, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxBytes {
		return nil, errors.New("event stream exceeds repair limit")
	}
	found := false
	var result [][]byte
	for len(data) > 0 {
		text, n := protowire.ConsumeString(data)
		if n < 0 {
			return nil, errors.New("invalid frame ID")
		}
		data = data[n:]
		frameID, err := uuid.Parse(text)
		if err != nil {
			return nil, err
		}
		ts, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, errors.New("invalid frame timestamp")
		}
		data = data[n:]
		count, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, errors.New("invalid frame count")
		}
		data = data[n:]
		size, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, errors.New("invalid frame size")
		}
		data = data[n:]
		if size > uint64(len(data)) {
			return nil, errors.New("truncated frame")
		}
		body := data[:int(size)]
		data = data[int(size):]
		selected := frameID == id
		if selected {
			if found {
				return nil, errors.New("duplicate encounter frame")
			}
			found = true
			if int64(ts) != start.UnixMilli() && (count != 0 || ts != 0) {
				return nil, errors.New("frame timestamp does not match encounter")
			}
		}
		for i := uint64(0); i < count; i++ {
			msg, n := protowire.ConsumeBytes(body)
			if n < 0 {
				return nil, errors.New("truncated event")
			}
			body = body[n:]
			if selected {
				result = append(result, msg)
			}
		}
		if len(body) != 0 {
			return nil, errors.New("frame count/length mismatch")
		}
	}
	if !found {
		return nil, errors.New("missing encounter frame")
	}
	return result, nil
}
