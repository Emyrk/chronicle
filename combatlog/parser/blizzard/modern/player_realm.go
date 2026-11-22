package modern

import (
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// PlayerRealmInfo holds an unresolved realm label from a Forever player name.
// It is evidence, not a canonical realm, and is never inferred from GUID bits.
type PlayerRealmInfo struct {
	RawRealm string
}

// recordPlayerRealm reuses the decoded display name and normalized GUID. The
// index is GUID -> normalized player name -> realm, not GUID -> realm -> player.
// First observed known realm wins in input order, even if later timestamps go
// backwards. Same-GUID/same-name players on different realms remain ambiguous;
// retaining the first realm is an intentional limitation of this metadata index.
func (r *transformReader) recordPlayerRealm(rawGUID, name, display string) {
	if r.playerRealms == nil {
		return
	}
	value, ok := r.guids.rawToValue[rawGUID]
	if !ok || display == "" {
		return
	}
	id := guid.GUID(value)
	// Names without realm suffixes still disqualify ambiguous GUID-only gear.
	if r.playerNames != nil {
		if r.playerNames[id] == nil {
			r.playerNames[id] = make(map[string]struct{})
		}
		r.playerNames[id][display] = struct{}{}
	}
	names := r.playerRealms[id]
	if _, known := names[display]; known {
		return
	}
	raw := playerRealmName(name)
	if raw == "" {
		return
	}
	if names == nil {
		names = make(map[string]PlayerRealmInfo)
		r.playerRealms[id] = names
	}
	names[display] = PlayerRealmInfo{RawRealm: raw}
}

func playerRealmName(name string) string {
	name = strings.TrimSuffix(name, "-")
	parts := strings.Split(name, "-")
	count := 1
	switch parts[len(parts)-1] {
	case "US", "EU", "KR", "TW", "CN":
		count = 2
	}
	if len(parts) <= count || parts[0] == "" {
		return ""
	}
	for _, part := range parts[len(parts)-count:] {
		if part == "" {
			return ""
		}
	}
	return strings.Join(parts[len(parts)-count:], "-")
}

// LookupPlayerRealm returns parse-wide raw evidence for an exact normalized
// name, never a GUID-only guess. Buffered input may already have populated it;
// this is not an as-of-time observation or a canonical realm identifier.
func (p *Parser) LookupPlayerRealm(id guid.GUID, name string) (string, bool) {
	if p == nil {
		return "", false
	}
	info, ok := p.playerRealms[id][name]
	return info.RawRealm, ok
}

// ObservedPlayerNames returns parse-wide input evidence, including names whose
// realm is unknown. It is independent of the GUID-only merged combatant state.
func (p *Parser) ObservedPlayerNames(id guid.GUID) []string {
	if p == nil {
		return nil
	}
	names := make([]string, 0, len(p.playerNames[id]))
	for name := range p.playerNames[id] {
		names = append(names, name)
	}
	return names
}

// NormalizePlayerName applies the Forever display-name normalization, not identity inference.
func NormalizePlayerName(name string) string { return stripRealm(name) }
