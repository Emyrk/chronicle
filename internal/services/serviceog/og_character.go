package serviceog

import (
	"context"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
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

// PlayerCareerReader reads a character's published career ratings for a tenant.
type PlayerCareerReader func(ctx context.Context, tenant, realm uuid.UUID, guid string) (serviceratings.PlayerCareerResult, error)

// characterRating is the career spec shown on the character card.
type characterRating struct {
	Spec    string
	Mastery float64
	Peak    float64
	Renown  float64
}

// fetchCharacterRating returns the character's spec with the highest Mastery
// (Renown breaks ties), or nil when ratings are unavailable, unready, or slow.
func (s *Service) fetchCharacterRating(ctx context.Context, p database.GetGamePlayerByGUIDRow) *characterRating {
	tenant := servicetenant.TenantIDFromContext(ctx)
	if s.playerCareer == nil || tenant == uuid.Nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, characterCardStatTimeout)
	defer cancel()
	result, err := s.playerCareer(ctx, tenant, p.RealmID, p.ID.String())
	if err != nil || result.Status != "ready" {
		return nil
	}
	return bestCharacterRating(result.Cohorts)
}

func bestCharacterRating(cohorts []serviceratings.PlayerCareer) *characterRating {
	var best *characterRating
	for _, c := range cohorts {
		if c.Mastery == nil {
			continue
		}
		if best != nil && (*c.Mastery < best.Mastery || (*c.Mastery == best.Mastery && c.Renown <= best.Renown)) {
			continue
		}
		peak := 0.0
		if c.Peak != nil {
			peak = *c.Peak
		}
		best = &characterRating{Spec: c.PlayerSpec, Mastery: *c.Mastery, Peak: peak, Renown: c.Renown}
	}
	return best
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

// characterCardParams builds the character card. With a career rating it shows
// Mastery, Peak, and Renown for that spec; otherwise item level, canonical
// listed logs seen, and last seen. The parse renderer is not selected.
func characterCardParams(p database.GetGamePlayerByGUIDRow, race, class string, rating *characterRating, stats characterCardStats) url.Values {
	params := url.Values{}
	params.Set("name", p.Name)
	params.Set("class", strings.ToLower(class))
	params.Set("race", race)
	// The renderer draws the male race icon when gender is absent.
	switch p.Gender {
	case database.WowPlayableGenderMale:
		params.Set("gender", "male")
	case database.WowPlayableGenderFemale:
		params.Set("gender", "female")
	}
	if rating != nil && rating.Spec != "" {
		params.Set("spec", rating.Spec)
	} else if spec := characterSpec(p); spec != "" {
		params.Set("spec", spec)
	}
	if p.Level > 0 {
		params.Set("level", strconv.Itoa(int(p.Level)))
	}
	if p.GuildName.String != "" {
		params.Set("guild", p.GuildName.String)
	}
	if rating != nil {
		params.Set("mastery", strconv.FormatFloat(rating.Mastery, 'f', 1, 64))
		params.Set("peak", strconv.FormatFloat(rating.Peak, 'f', 1, 64))
		params.Set("renown", strconv.Itoa(int(math.Round(rating.Renown))))
		return params
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
