package trailer

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/golang/wowlogs/types"
)

type Trailer []TrailerEntry

// TrailerEntry represents a single entry in the combat trailer
type TrailerEntry struct {
	Amount  *uint32
	HitType types.HitType
}

// ParseTrailer parses a combat trailer string and returns a slice of trailer entries
func ParseTrailer(trailer string) (Trailer, error) {
	var result []TrailerEntry

	for _, indTrailer := range strings.Split(trailer, ") (") {
		indTrailer = strings.ReplaceAll(indTrailer, "(", "")
		indTrailer = strings.ReplaceAll(indTrailer, ")", "")

		if indTrailer == "glancing" {
			result = append(result, TrailerEntry{Amount: nil, HitType: types.HitTypeGlancing})
		} else if indTrailer == "crushing" {
			result = append(result, TrailerEntry{Amount: nil, HitType: types.HitTypeCrushing})
		} else if indTrailer != "" {
			parts := strings.Split(indTrailer, " ")

			// Some private servers seems to have implemented "Vulnerability Bonus" which was removed on 1.9
			// It is decided to ignore this vulnerability trailer.
			if len(parts) > 1 && parts[1] == "vulnerability" {
				continue
			}

			if len(parts) > 1 {
				if amount, err := strconv.ParseUint(parts[0], 10, 32); err == nil {
					amount32 := uint32(amount)
					var hitType types.HitType

					switch parts[1] {
					case "resisted":
						hitType = types.HitTypePartialResist
					case "blocked":
						hitType = types.HitTypePartialBlock
					case "absorbed":
						hitType = types.HitTypePartialAbsorb
					default:
						return nil, fmt.Errorf("unexpected hit type: %s", parts[1])
					}

					result = append(result, TrailerEntry{Amount: &amount32, HitType: hitType})
				}
			}
		}
	}

	return result, nil
}
