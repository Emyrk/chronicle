package gamedataapi

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

type classBuffEffect struct {
	EffectIndex     int32   `json:"effect_index"`
	AuraEffect      int32   `json:"aura_effect"`
	AuraName        string  `json:"aura_name"`
	ImplicitTargets []int32 `json:"implicit_targets"`
}

type classBuffSpell struct {
	ID          int32             `json:"id"`
	Name        string            `json:"name"`
	NameSubtext string            `json:"name_subtext"`
	Targeting   string            `json:"targeting"`
	Effects     []classBuffEffect `json:"effects"`
}

func classBuffSpellFromSpell(spell *chrondbc.Spell) (classBuffSpell, bool) {
	if spell == nil || spell.Attrs.Has(chrondbc.Attr_Passive) || spell.IsDeprecated() {
		return classBuffSpell{}, false
	}
	if _, ok := playerClassName(spell.SpellClassSet); !ok {
		return classBuffSpell{}, false
	}

	var effects []classBuffEffect
	targeting := ""
	for _, effect := range spell.Effects {
		effectTargeting, ok := classBuffEffectTargeting(effect)
		if !ok {
			continue
		}
		if classBuffTargetingPriority(effectTargeting) > classBuffTargetingPriority(targeting) {
			targeting = effectTargeting
		}
		effects = append(effects, classBuffEffect{
			EffectIndex:     effect.EffectIndex,
			AuraEffect:      int32(effect.EffectAura),
			AuraName:        effect.EffectAura.String(),
			ImplicitTargets: append([]int32(nil), effect.ImplicitTarget...),
		})
	}
	if len(effects) == 0 {
		return classBuffSpell{}, false
	}

	subtext := spell.Subtext()
	if subtext == "<empty>" {
		subtext = ""
	}
	return classBuffSpell{
		ID:          int32(spell.ID),
		Name:        spell.Name(),
		NameSubtext: subtext,
		Targeting:   targeting,
		Effects:     effects,
	}, true
}

func classBuffEffectTargeting(effect chrondbc.SpellEffect) (string, bool) {
	if effect.EffectAura == chrondbc.AuraEffectDummy {
		return "", false
	}

	switch effect.Effect {
	case chrondbc.EffectApplyAreaAuraParty,
		chrondbc.EffectApplyAreaAuraRaid,
		chrondbc.EffectApplyAreaAuraFriend,
		chrondbc.EffectApplyAreaAuraPartyNonRandom:
		return "group", true
	case chrondbc.EffectApplyAura:
		return classBuffTargeting(effect.ImplicitTarget)
	default:
		return "", false
	}
}

func classBuffTargeting(targets []int32) (string, bool) {
	targeting := ""
	for _, rawTarget := range targets {
		var candidate string
		switch chrondbc.ImplicitTarget(rawTarget) {
		case chrondbc.ImplicitTargetUnitNearbyParty,
			chrondbc.ImplicitTargetUnitNearbyAlly,
			chrondbc.ImplicitTargetUnitTargetAlly:
			candidate = "friendly"
		case chrondbc.ImplicitTargetUnitCasterAreaParty,
			chrondbc.ImplicitTargetUnitSrcAreaAlly,
			chrondbc.ImplicitTargetUnitDestAreaAlly,
			chrondbc.ImplicitTargetUnitSrcAreaParty,
			chrondbc.ImplicitTargetUnitDestAreaParty,
			chrondbc.ImplicitTargetUnitTargetParty,
			chrondbc.ImplicitTargetUnitLastTargetAreaParty,
			chrondbc.ImplicitTargetUnitCasterAreaRaid,
			chrondbc.ImplicitTargetUnitTargetRaid,
			chrondbc.ImplicitTargetUnitNearbyRaid,
			chrondbc.ImplicitTargetUnitConeCasterToDestAlly,
			chrondbc.ImplicitTargetUnitDestAreaRaidClass:
			candidate = "group"
		default:
			continue
		}
		if classBuffTargetingPriority(candidate) > classBuffTargetingPriority(targeting) {
			targeting = candidate
		}
	}
	return targeting, targeting != ""
}

func classBuffTargetingPriority(targeting string) int {
	switch targeting {
	case "group":
		return 3
	case "friendly":
		return 2
	default:
		return 0
	}
}

func (h *Handler) deriveClassBuffs(ctx context.Context, datasetID uuid.UUID, spells []*chrondbc.Spell) error {
	byClass := make(map[string][]classBuffSpell)
	for _, spell := range spells {
		spell = spellForDerivedMetadata(spell)
		buff, ok := classBuffSpellFromSpell(spell)
		if !ok {
			continue
		}
		className, _ := playerClassName(spell.SpellClassSet)
		byClass[className] = append(byClass[className], buff)
	}

	for className := range byClass {
		sort.Slice(byClass[className], func(i, j int) bool {
			left, right := byClass[className][i], byClass[className][j]
			if left.Name != right.Name {
				return left.Name < right.Name
			}
			return left.ID < right.ID
		})
	}

	data, err := json.Marshal(byClass)
	if err != nil {
		return fmt.Errorf("marshal class buffs: %w", err)
	}
	store := database.New(h.pool)
	if err := store.UpsertDatasetClassBuffs(ctx, database.UpsertDatasetClassBuffsParams{
		DatasetID: datasetID,
		Data:      data,
	}); err != nil {
		return fmt.Errorf("upsert class buffs: %w", err)
	}
	return nil
}
