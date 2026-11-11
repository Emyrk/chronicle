package leaderboardconfig

import (
	"strconv"
	"strings"
)

// QueryValue is the career board's `raid` query value: Instance|Difficulty|MaxPlayers.
func (k CareerKey) QueryValue() string {
	return k.Instance + "|" + k.Difficulty + "|" + strconv.Itoa(int(k.MaxPlayers))
}

// ParseCareerKeyQuery reads a `raid` query value written by QueryValue.
func ParseCareerKeyQuery(raw string) (CareerKey, bool) {
	parts := strings.Split(raw, "|")
	if len(parts) != 3 || strings.TrimSpace(parts[0]) == "" {
		return CareerKey{}, false
	}
	size, err := strconv.ParseInt(parts[2], 10, 16)
	if err != nil || size < 0 {
		return CareerKey{}, false
	}
	return CareerKey{Instance: parts[0], Difficulty: parts[1], MaxPlayers: int16(size)}, true
}

// Label is the raid's display name: the instance, then its difficulty and size
// when set (the frontend's raidLabel).
func (k CareerKey) Label() string {
	parts := []string{k.Instance}
	if k.Difficulty != "" {
		parts = append(parts, k.Difficulty)
	}
	if k.MaxPlayers > 0 {
		parts = append(parts, strconv.Itoa(int(k.MaxPlayers)))
	}
	return strings.Join(parts, " ")
}
