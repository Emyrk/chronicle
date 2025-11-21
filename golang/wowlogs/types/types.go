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
	spellRegex = regexp.MustCompile(`^([^(]+)\((\d+)\)(\(.+\))?$`)
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

	//
	//nameEnd := strings.Index(spellStr, "(")
	//if nameEnd == -1 {
	//	return Spell{}, fmt.Errorf("invalid spell string, missing '('")
	//}
	//name := spellStr[:nameEnd]
	//rest := spellStr[nameEnd+1:]
	//
	//var rank *int
	//rankStart := strings.Index(rest, "(")
	//idStr := rest[:len(rest)-1]
	//if rankStart > 0 {
	//	rankStr := strings.TrimPrefix(rest[rankStart+1:len(rest)-1], "Rank ")
	//
	//	r, err := strconv.ParseInt(rankStr, 10, 64)
	//	if err != nil {
	//		return Spell{}, fmt.Errorf("rank: %v", err)
	//	}
	//	rank = ptr.Ref(int(r))
	//	idStr = rest[:rankStart-1]
	//}
	//
	//id, err := strconv.ParseInt(idStr, 10, 64)
	//if err != nil {
	//	return Spell{}, fmt.Errorf("id: %v", err)
	//}

	return Spell{
		Name: name,
		ID:   int(id),
		//Rank: rank,
	}, nil
}
