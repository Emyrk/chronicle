// Package leaderboardread validates preview read scopes. It does not populate
// evidence, refresh benchmarks, or define rolling-version transition policy.
package leaderboardread

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// Request identifies one exact cohort. Renown intentionally has no performance
// cohort or set selection. Tenant comes from request middleware, never input.
type Request struct {
	Instance, Difficulty         string
	MaxPlayers                   int16
	Subject, Kind, Score         string
	Boss, Set                    string
	Bosses                       []string
	Class, Spec, SubSpec, Metric string
	Realm                        uuid.UUID
	Search                       string
	FilterSubSpec                bool
}

type Selection struct {
	Bosses      []string
	Awards      []float64
	Denominator int32
}

func Select(rows []database.ResolveLeaderboardConfigurationRow, r Request) (Selection, error) {
	out := Selection{Bosses: []string{}, Awards: []float64{}, Denominator: 1}
	if r.Subject != "player" && r.Subject != "guild" {
		return out, errors.New("subject must be player or guild")
	}
	if r.Kind != "boss" && r.Kind != "clear" && r.Kind != "renown" {
		return out, errors.New("kind must be boss, clear, or renown")
	}
	if r.Score != "peak" && r.Score != "mastery" && r.Score != "renown" {
		return out, errors.New("score must be peak, mastery, or renown")
	}
	if (r.Kind == "renown") != (r.Score == "renown") {
		return out, errors.New("renown requires the Renown board")
	}
	if len(r.Search) > 100 {
		return out, errors.New("search must be at most 100 bytes")
	}
	if r.Kind == "renown" || r.Subject == "guild" {
		if r.Class != "" || r.Spec != "" || r.SubSpec != "" || r.FilterSubSpec || r.Metric != "" {
			return out, errors.New("performance cohort filters only apply to player performance boards")
		}
	} else if r.Metric != "dps" && r.Metric != "hps" {
		return out, errors.New("select DPS or HPS")
	}
	if r.Kind == "clear" && (r.Boss != "" || r.Set != "" || len(r.Bosses) > 0) {
		return out, errors.New("clear boards do not accept boss selections")
	}
	if r.Kind == "renown" && (r.Set != "" || len(r.Bosses) > 0) {
		return out, errors.New("renown accepts only an optional exact boss, never performance sets")
	}
	if r.Kind == "clear" && r.Subject != "guild" {
		return out, errors.New("clear boards are guild-only")
	}
	var enabled, variant bool
	variants := 0
	bosses := map[string]database.ResolveLeaderboardConfigurationRow{}
	setEnabled := false
	for _, row := range rows {
		if row.Kind == "conflict" {
			return out, errors.New("configuration conflict")
		}
		if row.InstanceName != r.Instance {
			continue
		}
		switch row.Kind {
		case "instance":
			enabled = true
		case "variant":
			variants++
			if row.DifficultyName == r.Difficulty && row.MaxPlayers == r.MaxPlayers {
				variant = true
			}
		case "boss":
			bosses[row.EncounterName] = row
		case "set":
			if row.SetKey == r.Set {
				setEnabled = true
			}
		}
	}
	if !enabled {
		return out, errors.New("instance is not enabled")
	}
	// Vanilla's exact identity is ''/0; this does not invent a Heroic variant.
	if variants == 0 {
		variant = r.Difficulty == "" && r.MaxPlayers == 0
	}
	if !variant {
		return out, errors.New("instance variant is not enabled")
	}
	selected := map[string]bool{}
	switch r.Kind {
	case "clear":
		return out, nil
	case "renown":
		if r.Boss != "" {
			if _, ok := bosses[r.Boss]; !ok {
				return out, errors.New("boss is not enabled")
			}
			selected[r.Boss] = true
		} else {
			for name := range bosses {
				selected[name] = true
			}
		}
	case "boss":
		modes := 0
		if r.Boss != "" {
			modes++
		}
		if r.Set != "" {
			modes++
		}
		if len(r.Bosses) > 0 {
			modes++
		}
		if modes != 1 {
			return out, errors.New("select exactly one boss, named set, or explicit boss group")
		}
		if len(r.Bosses) > 0 {
			if len(r.Bosses) > 256 {
				return out, errors.New("boss group exceeds 256 entries")
			}
			for _, name := range r.Bosses {
				if _, ok := bosses[name]; !ok {
					return out, errors.New("boss group contains a boss that is not enabled")
				}
				selected[name] = true
			}
		} else if r.Boss != "" {
			if _, ok := bosses[r.Boss]; !ok {
				return out, errors.New("boss is not enabled")
			}
			selected[r.Boss] = true
		} else {
			if !setEnabled {
				return out, errors.New("encounter set is not enabled")
			}
			for _, row := range rows {
				if row.InstanceName == r.Instance && row.Kind == "member" && row.SetKey == r.Set {
					if _, ok := bosses[row.EncounterName]; ok {
						selected[row.EncounterName] = true
					}
				}
			}
		}
	}
	for name := range selected {
		out.Bosses = append(out.Bosses, name)
	}
	slices.Sort(out.Bosses)
	for _, name := range out.Bosses {
		award := bosses[name]
		if variants > 0 {
			for _, row := range rows {
				if row.Kind == "boss_variant" && row.InstanceName == r.Instance && row.EncounterName == name && row.DifficultyName == r.Difficulty && row.MaxPlayers == r.MaxPlayers {
					award = row
					break
				}
			}
		}
		points := 0.0
		if award.HasPoints {
			points = award.Points
		}
		out.Awards = append(out.Awards, points)
	}
	if r.Kind == "boss" {
		out.Denominator = int32(len(out.Bosses))
	}
	return out, nil
}

type Cursor struct {
	Fingerprint string    `json:"f"`
	Score       float64   `json:"s"`
	Realm       uuid.UUID `json:"r"`
	Subject     string    `json:"i"`
	Class       string    `json:"c"`
	Spec        string    `json:"p"`
	SubSpec     string    `json:"u"`
}

func Fingerprint(tenant uuid.UUID, r Request, selection Selection) string {
	// An explicit group is an unordered set; duplicate/order changes are not a different cursor scope.
	if len(r.Bosses) > 0 {
		r.Bosses = slices.Clone(selection.Bosses)
	}
	// Award values and ordinary result changes do not invalidate a cursor.
	b, _ := json.Marshal(struct {
		Tenant  uuid.UUID
		Request Request
		Bosses  []string
	}{tenant, r, selection.Bosses})
	return fmt.Sprintf("%x", sha256.Sum256(b))
}
func DecodeCursor(raw, fingerprint string) (Cursor, error) {
	var c Cursor
	if len(raw) > 2048 {
		return c, errors.New("invalid cursor")
	}
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return c, errors.New("invalid cursor")
	}
	if err := json.Unmarshal(b, &c); err != nil || c.Fingerprint != fingerprint || math.IsNaN(c.Score) || math.IsInf(c.Score, 0) || c.Score < 0 || strings.TrimSpace(c.Subject) == "" {
		return c, errors.New("cursor does not match this selection")
	}
	return c, nil
}
func EncodeCursor(c Cursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}
