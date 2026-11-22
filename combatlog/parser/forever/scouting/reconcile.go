package scouting

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

// FilterSources evaluates independent snapshots before KnownAt can combine
// histories. It owns all returned values just like New; input artifacts remain
// untouched. The callback may normalize a source's identity labels.
func (s *Scouting) FilterSources(keep func(guid.GUID, Player) (Player, bool)) *Scouting {
	out := &Scouting{players: make(map[guid.GUID][]Player)}
	for _, id := range s.PlayerIDs() {
		for _, player := range s.players[id] {
			player.Gender = cloneValue(player.Gender)
			player.Observations = append([]Observation(nil), player.Observations...)
			for j := range player.Observations {
				player.Observations[j] = cloneObservation(player.Observations[j])
			}
			if player, ok := keep(id, player); ok {
				out.players[id] = append(out.players[id], player)
			}
		}
		if len(out.players[id]) > 0 {
			out.ids = append(out.ids, id)
		}
	}
	return out
}

// SourceNames includes every meaningful source name, not a latest-name guess.
func (s *Scouting) SourceNames(id guid.GUID) []string {
	if s == nil {
		return nil
	}
	names := make([]string, 0, len(s.players[id]))
	for _, player := range s.players[id] {
		names = append(names, player.Name)
	}
	return names
}

// IdentityName returns a unanimous source label without inspecting timestamped
// histories. It is a matching guard, not a named observation at any time.
func (s *Scouting) IdentityName(id guid.GUID) (string, bool) {
	if s == nil || len(s.players[id]) == 0 {
		return "", false
	}
	name := s.players[id][0].Name
	for _, player := range s.players[id] {
		if player.Name != name {
			return "", false
		}
	}
	return name, name != ""
}
