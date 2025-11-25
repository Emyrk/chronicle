package types

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/golang/internal/ptr"
)

// Conjure Water(10140)(Rank 7)
// Heavy Silk Bandage(7929)
type Spell struct {
	Name string
	ID   int
	Rank *int
}

var (
	spellRegex = regexp.MustCompile(`^(.+\S)\((\d+)\)(\(.+\))?$`)
)

func ParseSpell(spellStr string) (Spell, error) {
	pat, ok := FromRegex(spellRegex).Match(spellStr)
	if !ok {
		return Spell{}, fmt.Errorf("invalid spell string: %s", spellStr)
	}

	name := pat.String()
	id := pat.Uint32()

	var rank *int
	rankStr := pat.String()
	if rankStr != "" {
		rankStr = strings.Trim(rankStr, "()")
		rankStr = strings.TrimPrefix(rankStr, "Rank ")
		rankInt, err := strconv.ParseInt(rankStr, 10, 32)
		if err != nil {
			return Spell{}, fmt.Errorf("invalid rank: %v", err)
		}
		rank = ptr.Ref(int(rankInt))
	}

	return Spell{
		Name: name,
		ID:   int(id),
		Rank: rank,
	}, pat.Error()
}
