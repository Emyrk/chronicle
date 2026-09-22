package cli

import (
	"fmt"
	"path/filepath"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
)

type petTargetingEntry struct {
	ID         int32    `json:"id"`
	Name       string   `json:"name"`
	Class      string   `json:"class,omitempty"` // Empty when SpellClassSet is Generic (not a class ability).
	Reasons    []string `json:"reasons"`
	OmitReason string   `json:"omitReason,omitempty"` // Non-empty when the spell is explicitly excluded from pet ownership detection.
}

// petEffects are spell effect types that indicate pet interaction.
var petEffects = map[chrondbc.Effect]string{
	chrondbc.EffectSummonPet:        "SummonPet",
	chrondbc.EffectFeedPet:          "FeedPet",
	chrondbc.EffectDismissPet:       "DismissPet",
	chrondbc.EffectResurrectPet:     "ResurrectPet",
	chrondbc.EffectTameCreature:     "TameCreature",
	chrondbc.EffectLearnPetSpell:    "LearnPetSpell",
	chrondbc.EffectApplyAreaAuraPet: "ApplyAreaAuraPet",
}

// petAttributes are spell-level attributes that indicate pet interaction.
var petAttributes = []struct {
	Attr chrondbc.Attribute
	Name string
}{
	{chrondbc.AttrEx_DismissPet, "DismissPet"},
	{chrondbc.AttrEx2_HealthFunnel, "HealthFunnel"},
	{chrondbc.AttrEx2_TameBeast, "TameBeast"},
	{chrondbc.AttrEx2_ReqDeadPet, "ReqDeadPet"},
	{chrondbc.AttrEx4_IsPetScaling, "IsPetScaling"},
}

// PetTargetingReasons returns the set of reasons a spell is considered
// pet-targeting. An empty slice means the spell has no pet-targeting
// indicators.
func PetTargetingReasons(spell *chrondbc.Spell) []string {
	var reasons []string

	for _, effect := range spell.Effects {
		if label, ok := petEffects[effect.Effect]; ok {
			reasons = append(reasons, fmt.Sprintf("Effect[%d]=%s", effect.EffectIndex, label))
		}

		for targetIndex, target := range effect.ImplicitTarget {
			label := "ImplicitTargetA"
			if targetIndex == 1 {
				label = "ImplicitTargetB"
			}
			switch chrondbc.ImplicitTarget(target) {
			case chrondbc.ImplicitTargetUnitPet:
				reasons = append(reasons, fmt.Sprintf("%s[%d]=UnitPet", label, effect.EffectIndex))
			case chrondbc.ImplicitTargetUnitMaster:
				reasons = append(reasons, fmt.Sprintf("%s[%d]=UnitMaster", label, effect.EffectIndex))
			}
		}
	}

	// Spell-level attributes.
	for _, pa := range petAttributes {
		if spell.Attrs.Has(pa.Attr) {
			reasons = append(reasons, fmt.Sprintf("Attr=%s", pa.Name))
		}
	}

	return reasons
}

func collectPetTargetingAbilities(wc *dbcdb.WoWClient) ([]petTargetingEntry, error) {
	spellsDBC, err := wc.Spells()
	if err != nil {
		return nil, fmt.Errorf("read spells: %w", err)
	}

	spells := chrondbc.NewSpells(spellsDBC.Underlying())
	var entries []petTargetingEntry

	err = spells.Range(func(spell *chrondbc.Spell) bool {
		reasons := PetTargetingReasons(spell)
		if len(reasons) == 0 {
			return true
		}

		var class string
		if spell.SpellClassSet != chrondbc.SpellClassSetGeneric {
			class = spell.SpellClassSet.String()
		}

		entry := petTargetingEntry{
			ID:      int32(spell.ID),
			Name:    spell.String(),
			Class:   class,
			Reasons: reasons,
		}
		if reason, ok := synthetic.PetTargetingOmitted[spell.ID]; ok {
			entry.OmitReason = reason
		}

		entries = append(entries, entry)
		return true
	})
	if err != nil {
		return nil, fmt.Errorf("iterate spells: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].ID < entries[j].ID
	})

	return entries, nil
}

func generatePetTargetingAbilities(wc *dbcdb.WoWClient, assetsDir string) error {
	data, err := collectPetTargetingAbilities(wc)
	if err != nil {
		return err
	}

	return writeJSON(filepath.Join(assetsDir, "pet-targeting-abilities.json"), data)
}
