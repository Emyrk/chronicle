// Package scouting interprets Sidekick Forever scouting snapshots without merging
// accounts or applying observations to combat logs. Timestamps are Unix seconds.
package scouting

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/forever/events"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/luadata"
)

// Observation is a complete decoded row. Nil means unknown, not a deletion.
// Race and Gender are always nil: v1 scouting does not observe them.
// GUID preserves the source identity; no lossy compatibility conversion occurs.
type Observation struct {
	GUID   string
	At     int64
	Name   string
	Level  *int
	Guild  *string
	Party  *bool
	Race   *int
	Gender *int
}

type Player struct {
	Name         string
	LastSeen     int64
	Observations []Observation
}

// Source retains snapshot boundaries even when account/path metadata repeats.
type Source struct {
	Index   int
	Account string
	Path    string
	Players map[string]Player
}

// Lookup returns the last row at or before at. For repeated timestamps, the
// last encoded row wins. LastSeen is metadata, never an inferred observation.
func (p Player) Lookup(at int64) (Observation, bool) {
	i := sort.Search(len(p.Observations), func(i int) bool { return p.Observations[i].At > at })
	if i == 0 {
		return Observation{}, false
	}
	return p.Observations[i-1], true
}

// KnownFields preserves the timestamp for each freshest known field separately.
// An unchanged delta is still a fresh observation. Unknown rows do not erase
// earlier knowledge. Callers decide whether this knowledge is fresh enough.
type KnownFields struct {
	Name  *Observation
	Level *Observation
	Guild *Observation
	Party *Observation
}

func (p Player) KnownAt(at int64) KnownFields {
	var result KnownFields
	end := sort.Search(len(p.Observations), func(i int) bool { return p.Observations[i].At > at })
	for i := end - 1; i >= 0; i-- {
		row := p.Observations[i]
		if result.Name == nil && row.Name != "" {
			result.Name = &row
		}
		if result.Level == nil && row.Level != nil {
			result.Level = &row
		}
		if result.Guild == nil && row.Guild != nil {
			result.Guild = &row
		}
		if result.Party == nil && row.Party != nil {
			result.Party = &row
		}
		if result.Name != nil && result.Level != nil && result.Guild != nil && result.Party != nil {
			break
		}
	}
	return result
}

// Decode interprets only collections.scouting; sources without it remain empty.
// Malformed collections fail atomically rather than returning partial knowledge.
func Decode(artifact *events.Artifact) ([]Source, error) {
	if artifact == nil {
		return nil, fmt.Errorf("nil events artifact")
	}
	sources := make([]Source, 0, len(artifact.Sources))
	for i, src := range artifact.Sources {
		if src.Collections.Kind != luadata.Table {
			return nil, fmt.Errorf("source %d: collections must be a table", i)
		}
		out := Source{Index: i, Account: src.Account, Path: src.Path, Players: map[string]Player{}}
		if collection, ok := src.Collections.Fields["scouting"]; ok {
			players, err := DecodeCollection(collection)
			if err != nil {
				return nil, fmt.Errorf("source %d: %w", i, err)
			}
			out.Players = players
		}
		sources = append(sources, out)
	}
	return sources, nil
}

// DecodeCollection decodes the scouting table (not the enclosing collections).
func DecodeCollection(collection luadata.Value) (map[string]Player, error) {
	if collection.Kind != luadata.Table {
		return nil, fmt.Errorf("scouting must be a table")
	}
	version, err := integer(collection.Fields["Version"])
	if err != nil || version != 1 {
		return nil, fmt.Errorf("scouting Version must be 1")
	}
	players := collection.Fields["Players"]
	if players.Kind != luadata.Table || len(players.Array) != 0 || len(players.NumericFields) != 0 {
		return nil, fmt.Errorf("players must be GUID-keyed")
	}
	result := make(map[string]Player, len(players.Fields))
	keys := make([]string, 0, len(players.Fields))
	for key := range players.Fields {
		keys = append(keys, key)
	}
	sort.Strings(keys) // Stable diagnostics, independent of Go map iteration.
	for _, key := range keys {
		if _, err := NormalizeGUID(key); err != nil {
			return nil, err
		}
		player, err := decodePlayer(key, players.Fields[key])
		if err != nil {
			return nil, fmt.Errorf("player %s: %w", key, err)
		}
		result[key] = player
	}
	return result, nil
}

func decodePlayer(id string, value luadata.Value) (Player, error) {
	var p Player
	if value.Kind != luadata.Table {
		return p, fmt.Errorf("expected player table")
	}
	name := value.Fields["Name"]
	if name.Kind != luadata.String || name.Text == "" {
		return p, fmt.Errorf("name must be a nonempty string")
	}
	p.Name = name.Text
	last, err := integer(value.Fields["LastSeen"])
	if err != nil || last < 0 {
		return p, fmt.Errorf("LastSeen must be a nonnegative integer")
	}
	p.LastSeen = last
	var lists [4][]luadata.Value
	for i, field := range []string{"At", "Levels", "Guilds", "Party"} {
		lists[i], err = sequence(value.Fields[field])
		if err != nil {
			return p, fmt.Errorf("%s: %w", field, err)
		}
		if len(lists[i]) != len(lists[0]) {
			return p, fmt.Errorf("%s does not align with At", field)
		}
	}
	var previous Observation
	for i, timestamp := range lists[0] {
		at, err := integer(timestamp)
		if err != nil || at < 0 || (i > 0 && at < previous.At) {
			return p, fmt.Errorf("at[%d] must be a chronological nonnegative integer", i+1)
		}
		row := Observation{GUID: id, At: at, Name: p.Name}
		for field, v := range []luadata.Value{lists[1][i], lists[2][i], lists[3][i]} {
			if v.Kind == luadata.String && v.Text == "_" {
				if i == 0 {
					return p, fmt.Errorf("delta without previous row at index 1")
				}
				switch field {
				case 0:
					row.Level = previous.Level
				case 1:
					row.Guild = previous.Guild
				case 2:
					row.Party = previous.Party
				}
				continue
			}
			switch field {
			case 0:
				if v.Kind == luadata.Bool && !v.Boolean {
					continue
				}
				level, err := integer(v)
				if err != nil || level < 1 || level > 255 {
					return p, fmt.Errorf("invalid level at index %d", i+1)
				}
				n := int(level)
				row.Level = &n
			case 1:
				if v.Kind == luadata.Bool && !v.Boolean {
					continue
				}
				if v.Kind != luadata.String {
					return p, fmt.Errorf("invalid guild at index %d", i+1)
				}
				s := v.Text
				row.Guild = &s
			case 2:
				if v.Kind != luadata.Bool {
					return p, fmt.Errorf("invalid party at index %d", i+1)
				}
				b := v.Boolean
				row.Party = &b
			}
		}
		p.Observations = append(p.Observations, row)
		previous = row
	}
	return p, nil
}

func integer(v luadata.Value) (int64, error) {
	if v.Kind != luadata.Number {
		return 0, fmt.Errorf("expected integer")
	}
	return strconv.ParseInt(v.Text, 10, 64)
}

// sequence accepts implicit arrays and explicit contiguous numeric indices,
// rejecting holes, aliases, and collisions instead of silently shifting rows.
func sequence(v luadata.Value) ([]luadata.Value, error) {
	if v.Kind != luadata.Table || len(v.Fields) != 0 {
		return nil, fmt.Errorf("expected array")
	}
	n := len(v.Array) + len(v.NumericFields)
	out := make([]luadata.Value, n)
	copy(out, v.Array)
	seen := make([]bool, n)
	for i := range v.Array {
		seen[i] = true
	}
	for key, value := range v.NumericFields {
		index, err := strconv.Atoi(key)
		if err != nil || index < 1 || index > n || seen[index-1] {
			return nil, fmt.Errorf("array indices must be contiguous and unique")
		}
		seen[index-1] = true
		out[index-1] = value
	}
	return out, nil
}

// NormalizeGUID maps player identities to the same lossless compatibility GUID
// as the modern combat-log parser: server << 32 | player ID.
func NormalizeGUID(raw string) (guid.GUID, error) {
	if strings.HasPrefix(raw, "0x") {
		id, err := guid.FromString(raw)
		if err == nil && id != 0 && id.IsPlayer() {
			return id, nil
		}
	} else {
		parts := strings.Split(raw, "-")
		if len(parts) == 3 && parts[0] == "Player" {
			server, serverErr := strconv.ParseUint(parts[1], 10, 16)
			id, idErr := strconv.ParseUint(parts[2], 16, 32)
			if serverErr == nil && idErr == nil && id != 0 {
				return guid.GUID(server<<32 | id), nil
			}
		}
	}
	return 0, fmt.Errorf("invalid player GUID %q", raw)
}
