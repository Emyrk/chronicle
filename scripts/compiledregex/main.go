package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/regexs"
	"github.com/KromDaniel/regengo"
)

// Optimizing regex performance by compiling frequently used regex patterns into Go code.
func main() {
	var (
		outDir = flag.String("output", ".", "Output directory for the compiled regex Go code.")
		pkg    = flag.String("package", "compiled", "Package name for the compiled regex Go code.")
	)
	flag.Parse()

	compile := map[string]*regexp.Regexp{
		// From LegacyPlayer
		"ReDamageHitOrCrit":                            regexs.ReDamageHitOrCrit,
		"ReDamageHitOrCritSchool":                      regexs.ReDamageHitOrCritSchool,
		"ReDamageMiss":                                 regexs.ReDamageMiss,
		"ReDamageBlockParryEvadeDodgeDeflect":          regexs.ReDamageBlockParryEvadeDodgeDeflect,
		"ReDamageAbsorbResist":                         regexs.ReDamageAbsorbResist,
		"ReDamageImmune":                               regexs.ReDamageImmune,
		"ReDamageSpellHitOrCrit":                       regexs.ReDamageSpellHitOrCrit,
		"ReDamageSpellHitOrCritSchool":                 regexs.ReDamageSpellHitOrCritSchool,
		"ReDamagePeriodic":                             regexs.ReDamagePeriodic,
		"ReDamageSpellSplit":                           regexs.ReDamageSpellSplit,
		"ReDamageSpellMiss":                            regexs.ReDamageSpellMiss,
		"ReDamageSpellBlockParryEvadeDodgeResistDeflect": regexs.ReDamageSpellBlockParryEvadeDodgeResistDeflect,
		"ReDamageSpellAbsorb":                          regexs.ReDamageSpellAbsorb,
		"ReDamageSpellAbsorbSelf":                      regexs.ReDamageSpellAbsorbSelf,
		"ReDamageReflect":                              regexs.ReDamageReflect,
		"ReDamageProcResist":                           regexs.ReDamageProcResist,
		"ReDamageSpellImmune":                          regexs.ReDamageSpellImmune,
		"ReSpellCastAttempt":                           regexs.ReSpellCastAttempt,
		"ReDamageShield":                               regexs.ReDamageShield,
		"ReHealHit":                                    regexs.ReHealHit,
		"ReHealCrit":                                   regexs.ReHealCrit,
		"ReHeal":                                       regexs.ReHeal,
		"ReGain":                                       regexs.ReGain,
		"ReAuraGainHarmfulHelpful":                     regexs.ReAuraGainHarmfulHelpful,
		"ReAuraFade":                                   regexs.ReAuraFade,
		"ReAuraDispel":                                 regexs.ReAuraDispel,
		"ReAuraInterrupt":                              regexs.ReAuraInterrupt,
		"ReSpellCastPerformDurability":                 regexs.ReSpellCastPerformDurability,
		"ReSpellCastPerform":                           regexs.ReSpellCastPerform,
		"ReSpellCastPerformUnknown":                    regexs.ReSpellCastPerformUnknown,
		"ReUnitDieDestroyed":                           regexs.ReUnitDieDestroyed,
		"ReUnitSlay":                                   regexs.ReUnitSlay,
		"ReHonorableKill":                              regexs.ReHonorableKill,
		"ReZoneInfo":                                   regexs.ReZoneInfo,
		"ReLoot":                                       regexs.ReLoot,
		"ReBugDamageSpellHitOrCrit":                    regexs.ReBugDamageSpellHitOrCrit,

		// From myself
		"ReCreates":            regexs.ReCreates,
		"ReGainsAttack":        regexs.ReGainsAttack,
		"ReFallDamage":         regexs.ReFallDamage,
		"ReV2CastsRankTarget":  regexs.ReV2CastsRankTarget,
		"ReV2Cast":             regexs.ReV2Cast,
		"ReUnitDieDestroyedExp": regexs.ReUnitDieDestroyedExp,
		"ReDurabilityLoss":     regexs.ReDurabilityLoss,
		"ReUsesConsumable":     regexs.ReUsesConsumable,
		"ReResourceDrain":      regexs.ReResourceDrain,
		"ReReputationChange":   regexs.ReReputationChange,
		"RePetEats":            regexs.RePetEats,
		"ReKilledBy":           regexs.ReKilledBy,
		"ReLavaSwimming":       regexs.ReLavaSwimming,
		"ReFullResist":         regexs.ReFullResist,
		"ReFullImmune":         regexs.ReFullImmune,
		"ReHappiness":          regexs.ReHappiness,
		"RePetDismissed":       regexs.RePetDismissed,
	}

	order := make([]string, 0, len(compile))
	for name := range compile {
		order = append(order, name)
	}
	sort.Strings(order)

	var out strings.Builder
	out.WriteString("package matchers \n\n")
	out.WriteString(`import (
  "github.com/Emyrk/chronicle/combatlog/parser/regexs/compiled"
  "github.com/Emyrk/chronicle/combatlog/parser/types"
)`)
	out.WriteString("\n\n")
	for _, name := range order {
		pattern := compile[name]
		err := regengo.Compile(regengo.Options{
			Pattern:    pattern.String(),
			Name:       name,
			OutputFile: filepath.Join(*outDir, strings.ToLower(name)+".go"),
			Package:    *pkg,
		})
		if err != nil {
			panic(fmt.Sprintf("%s: %s", name, err.Error()))
		}

		out.WriteString(fmt.Sprintf(`func %[1]s() *types.Pattern {
  return types.FromCompiled[*compiled.%[1]sResult](compiled.Compiled%[1]s)
}`, name))
		out.WriteString("\n\n")
	}

	path := filepath.Join(*outDir, "matchers", "compiled.go")
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	err := os.WriteFile(path, []byte(out.String()), 0644)
	if err != nil {
		panic(err)
	}
}
