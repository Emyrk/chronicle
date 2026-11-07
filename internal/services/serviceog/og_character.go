package serviceog

import (
	"context"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
)

// characterCardStatTimeout bounds each stat lookup for the character card.
// They run while the page HTML is served; a slow one drops its stat.
const characterCardStatTimeout = 1500 * time.Millisecond

// characterCardStats are the optional history metrics shown on the released
// character card. A nil count means the lookup failed or timed out.
type characterCardStats struct {
	Logs *int
}

// fetchCharacterCardStats counts canonical listed raid logs in which the
// character has a ranked boss kill. Character performance is intentionally not
// selected yet because a character may have distinct healing and damage specs.
func (s *Service) fetchCharacterCardStats(ctx context.Context, p database.GetGamePlayerByGUIDRow) characterCardStats {
	ctx, cancel := context.WithTimeout(ctx, characterCardStatTimeout)
	defer cancel()
	count, err := s.store.GetCharacterLogCount(ctx, database.GetCharacterLogCountParams{
		PlayerGuid: p.ID.String(),
		RealmID:    uuid.NullUUID{UUID: p.RealmID, Valid: true},
	})
	if err != nil {
		return characterCardStats{}
	}
	logs := int(count)
	return characterCardStats{Logs: &logs}
}

// characterSpec infers the spec from the player's talent points, or "" when
// there are no talents.
func characterSpec(p database.GetGamePlayerByGUIDRow) string {
	if p.Talents == nil {
		return ""
	}
	var summary [3]uint8
	for i, tree := range p.Talents.Trees {
		summary[i] = uint8(min(max(tree.PointsSpent, 0), math.MaxUint8))
	}
	spec := wowspec.InferSpec(string(p.Class), summary)
	if spec == "Unknown" {
		return ""
	}
	return spec
}

// characterAverageItemLevel averages item level over equipped slots, skipping
// shirt and tabard like the armory tracker. ok is false when no equipped item
// has a known item level.
func characterAverageItemLevel(gear *database.PlayerOutfit) (avg int, ok bool) {
	if gear == nil {
		return 0, false
	}
	const slotShirt, slotTabard = 3, 18
	var sum, count int
	for i, item := range gear {
		if i == slotShirt || i == slotTabard || item.ItemID == 0 || item.ItemLevel == nil {
			continue
		}
		sum += int(*item.ItemLevel)
		count++
	}
	if count == 0 {
		return 0, false
	}
	return int(math.Round(float64(sum) / float64(count))), true
}

// characterCardParams builds the released character-history card: item level,
// canonical listed logs seen, and last seen. The performance renderer remains
// available for design review but is not selected by Chronicle yet.
func characterCardParams(p database.GetGamePlayerByGUIDRow, race, class string, stats characterCardStats) url.Values {
	params := url.Values{}
	params.Set("name", p.Name)
	params.Set("class", strings.ToLower(class))
	params.Set("race", race)
	if spec := characterSpec(p); spec != "" {
		params.Set("spec", spec)
	}
	if p.Level > 0 {
		params.Set("level", strconv.Itoa(int(p.Level)))
	}
	if p.GuildName.String != "" {
		params.Set("guild", p.GuildName.String)
	}
	if ilvl, ok := characterAverageItemLevel(p.Gear); ok {
		params.Set("ilvl", strconv.Itoa(ilvl))
	}

	if stats.Logs != nil {
		params.Set("logs", strconv.Itoa(*stats.Logs))
	}
	if p.UpdatedAt.Valid {
		params.Set("seen", p.UpdatedAt.Time.UTC().Format("Jan 2006"))
	}
	return params
}
