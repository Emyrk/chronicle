package wdb

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
)

// ParseCreatureTemplateSQL parses AzerothCore-format MySQL INSERT statements
// for the creature_template table and returns WorldCreatureTemplate rows.
// It expects positional VALUES matching the AzerothCore schema column order.
func ParseCreatureTemplateSQL(r io.Reader) ([]database.WorldCreatureTemplate, error) {
	scanner := bufio.NewScanner(r)
	// MySQL dumps can have very long INSERT lines (many rows per statement).
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024*1024)

	var results []database.WorldCreatureTemplate

	// MySQL dumps may have the INSERT keyword on one line and VALUE rows on
	// subsequent lines.  We accumulate lines once we see the INSERT prefix
	// until a line ending with ';' closes the statement.
	var inInsert bool
	var stmt strings.Builder

	for scanner.Scan() {
		line := scanner.Text()

		if !inInsert {
			if !strings.HasPrefix(line, "INSERT INTO `creature_template` VALUES") {
				continue
			}
			inInsert = true
			stmt.Reset()
		}

		stmt.WriteString(line)
		stmt.WriteByte('\n')

		// Statement ends when the line ends with ';'
		trimmed := strings.TrimRight(line, " \t\r")
		if !strings.HasSuffix(trimmed, ";") {
			continue
		}

		inInsert = false
		rows, err := parseMySQLValueRows(stmt.String())
		if err != nil {
			return nil, fmt.Errorf("parse INSERT statement: %w", err)
		}

		for _, vals := range rows {
			ct, err := creatureRowFromValues(vals)
			if err != nil {
				return nil, err
			}
			results = append(results, ct)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return results, nil
}

// parseMySQLValueRows splits "INSERT INTO ... VALUES (v1,v2,...),(v1,v2,...),...;" into
// a slice of value slices. Handles quoted strings containing commas, parens, and escapes.
func parseMySQLValueRows(line string) ([][]string, error) {
	// Find the first '(' after "VALUES"
	idx := strings.Index(line, "VALUES")
	if idx == -1 {
		idx = strings.Index(line, "values")
	}
	if idx == -1 {
		return nil, fmt.Errorf("no VALUES keyword found")
	}
	rest := line[idx+6:] // skip "VALUES"

	var rows [][]string
	i := 0
	for i < len(rest) {
		// Find opening '('
		for i < len(rest) && rest[i] != '(' {
			i++
		}
		if i >= len(rest) {
			break
		}
		i++ // skip '('

		// Parse values until closing ')'
		var vals []string
		for i < len(rest) {
			val, next, err := parseOneValue(rest, i)
			if err != nil {
				return nil, err
			}
			vals = append(vals, val)
			i = next
			if i < len(rest) && rest[i] == ')' {
				i++ // skip ')'
				break
			}
			if i < len(rest) && rest[i] == ',' {
				i++ // skip ','
			}
		}
		rows = append(rows, vals)
	}
	return rows, nil
}

// parseOneValue parses a single MySQL value starting at position i.
// Returns the value string, the next position, and any error.
func parseOneValue(s string, i int) (string, int, error) {
	if i >= len(s) {
		return "", i, fmt.Errorf("unexpected end of input")
	}

	// NULL
	if i+4 <= len(s) && s[i:i+4] == "NULL" {
		return "NULL", i + 4, nil
	}

	// Quoted string
	if s[i] == '\'' {
		i++ // skip opening quote
		var b strings.Builder
		for i < len(s) {
			if s[i] == '\\' && i+1 < len(s) {
				// MySQL escape sequences
				i++
				switch s[i] {
				case '\'':
					b.WriteByte('\'')
				case '\\':
					b.WriteByte('\\')
				case 'n':
					b.WriteByte('\n')
				case 'r':
					b.WriteByte('\r')
				case 't':
					b.WriteByte('\t')
				case '0':
					b.WriteByte(0)
				default:
					b.WriteByte(s[i])
				}
				i++
				continue
			}
			if s[i] == '\'' {
				// Check for '' escape (doubled quote)
				if i+1 < len(s) && s[i+1] == '\'' {
					b.WriteByte('\'')
					i += 2
					continue
				}
				i++ // skip closing quote
				return b.String(), i, nil
			}
			b.WriteByte(s[i])
			i++
		}
		return "", i, fmt.Errorf("unterminated string")
	}

	// Numeric value (or other unquoted token)
	start := i
	for i < len(s) && s[i] != ',' && s[i] != ')' {
		i++
	}
	return s[start:i], i, nil
}

// AzerothCore creature_template column indices (positional in INSERT VALUES).
const (
	acEntry            = 0
	acModelID1         = 6
	acModelID2         = 7
	acModelID3         = 8
	acModelID4         = 9
	acName             = 10
	acSubname          = 11
	acMinLevel         = 14
	acMaxLevel         = 15
	acMinDmg           = 23
	acMaxDmg           = 24
	acDmgSchool        = 25
	acAttackPower      = 26
	acDmgMultiplier    = 27
	acBaseAttackTime   = 28
	acRangeAttackTime  = 29
	acUnitClass        = 30
	acUnitFlags        = 31
	acMinRangedDmg     = 39
	acMaxRangedDmg     = 40
	acResistance1      = 47 // holy
	acResistance2      = 48 // fire
	acResistance3      = 49 // nature
	acResistance4      = 50 // frost
	acResistance5      = 51 // shadow
	acResistance6      = 52 // arcane
	acHealthMod        = 69
	acManaMod          = 70
	acArmorMod         = 71
	acMechanicImmune   = 81
	acMinCols          = 85
)

func creatureRowFromValues(vals []string) (database.WorldCreatureTemplate, error) {
	var ct database.WorldCreatureTemplate
	if len(vals) < acMinCols {
		return ct, fmt.Errorf("creature entry: expected >=%d columns, got %d", acMinCols, len(vals))
	}

	entry, err := atoi32(vals[acEntry])
	if err != nil {
		return ct, fmt.Errorf("creature entry: %w", err)
	}
	ct.Entry = entry
	ct.DisplayId1, _ = atoi32(vals[acModelID1])
	ct.DisplayId2, _ = atoi32(vals[acModelID2])
	ct.DisplayId3, _ = atoi32(vals[acModelID3])
	ct.DisplayId4, _ = atoi32(vals[acModelID4])
	ct.Name = unquote(vals[acName])
	if vals[acSubname] != "NULL" {
		ct.Subname = pgtype.Text{String: unquote(vals[acSubname]), Valid: true}
	}
	ct.LevelMin, _ = atoi32(vals[acMinLevel])
	ct.LevelMax, _ = atoi32(vals[acMaxLevel])
	ct.DmgMin, _ = atof64(vals[acMinDmg])
	ct.DmgMax, _ = atof64(vals[acMaxDmg])
	ct.DmgSchool, _ = atoi32(vals[acDmgSchool])
	ct.AttackPower, _ = atoi32(vals[acAttackPower])
	ct.DmgMultiplier, _ = atof64(vals[acDmgMultiplier])
	ct.BaseAttackTime, _ = atoi32(vals[acBaseAttackTime])
	ct.RangedAttackTime, _ = atoi32(vals[acRangeAttackTime])
	ct.UnitClass, _ = atoi32(vals[acUnitClass])
	ct.UnitFlags, _ = atoi32(vals[acUnitFlags])
	ct.RangedDmgMin, _ = atof64(vals[acMinRangedDmg])
	ct.RangedDmgMax, _ = atof64(vals[acMaxRangedDmg])
	ct.HolyRes, _ = atoi32(vals[acResistance1])
	ct.FireRes, _ = atoi32(vals[acResistance2])
	ct.NatureRes, _ = atoi32(vals[acResistance3])
	ct.FrostRes, _ = atoi32(vals[acResistance4])
	ct.ShadowRes, _ = atoi32(vals[acResistance5])
	ct.ArcaneRes, _ = atoi32(vals[acResistance6])
	ct.MechanicImmuneMask, _ = atoi64(vals[acMechanicImmune])

	// AzerothCore stores Health_mod/Mana_mod/Armor_mod as float multipliers,
	// not absolute values. Our schema stores absolute values (health_min, etc.).
	// We leave health_min/max, mana_min/max, armor at 0 since the dump doesn't
	// have absolute values — those come from creature_classlevelstats * mod.
	// We could compute them but that requires the classlevelstats table.

	return ct, nil
}

// ParseItemTemplateSQL parses AzerothCore-format MySQL INSERT statements
// for the item_template table and returns WorldItemTemplate rows.
func ParseItemTemplateSQL(r io.Reader) ([]database.WorldItemTemplate, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024*1024)

	var results []database.WorldItemTemplate
	var inInsert bool
	var stmt strings.Builder

	for scanner.Scan() {
		line := scanner.Text()

		if !inInsert {
			if !strings.HasPrefix(line, "INSERT INTO `item_template` VALUES") {
				continue
			}
			inInsert = true
			stmt.Reset()
		}

		stmt.WriteString(line)
		stmt.WriteByte('\n')

		trimmed := strings.TrimRight(line, " \t\r")
		if !strings.HasSuffix(trimmed, ";") {
			continue
		}

		inInsert = false
		rows, err := parseMySQLValueRows(stmt.String())
		if err != nil {
			return nil, fmt.Errorf("parse INSERT statement: %w", err)
		}

		for _, vals := range rows {
			it, err := itemRowFromValues(vals)
			if err != nil {
				return nil, err
			}
			results = append(results, it)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return results, nil
}

// AzerothCore item_template column indices (positional in INSERT VALUES).
// 139 columns total (indices 0-138).
const (
	aiEntry           = 0
	aiClass           = 1
	aiSubclass        = 2
	// 3 = SoundOverrideSubclass (not in our schema)
	aiName            = 4
	aiDisplayID       = 5
	aiQuality         = 6
	aiFlags           = 7
	// 8 = FlagsExtra
	aiBuyCount        = 9
	aiBuyPrice        = 10
	aiSellPrice       = 11
	aiInventoryType   = 12
	aiAllowableClass  = 13
	aiAllowableRace   = 14
	aiItemLevel       = 15
	aiRequiredLevel   = 16
	aiRequiredSkill   = 17
	aiRequiredSkillRank = 18
	aiRequiredSpell   = 19
	aiRequiredHonorRank = 20
	aiRequiredCityRank = 21
	aiRequiredRepFaction = 22
	aiRequiredRepRank = 23
	aiMaxCount        = 24
	aiStackable       = 25
	aiContainerSlots  = 26
	// 27 = StatsCount (not stored separately)
	aiStatType1       = 28
	aiStatValue1      = 29
	// ... pairs up to stat_type10=46, stat_value10=47
	aiScalingStatDist = 48
	aiScalingStatVal  = 49
	aiDmgMin1         = 50
	aiDmgMax1         = 51
	aiDmgType1        = 52
	aiDmgMin2         = 53
	aiDmgMax2         = 54
	aiDmgType2        = 55
	aiArmor           = 56
	aiHolyRes         = 57
	aiFireRes         = 58
	aiNatureRes       = 59
	aiFrostRes        = 60
	aiShadowRes       = 61
	aiArcaneRes       = 62
	aiDelay           = 63
	aiAmmoType        = 64
	aiRangedModRange  = 65
	aiSpellID1        = 66
	aiSpellTrigger1   = 67
	aiSpellCharges1   = 68
	aiSpellPPMRate1   = 69
	aiSpellCooldown1  = 70
	aiSpellCategory1  = 71
	aiSpellCatCD1     = 72
	// spell 2-5 follow at intervals of 7
	aiBonding         = 101
	aiDescription     = 102
	aiPageText        = 103
	aiLanguageID      = 104
	aiPageMaterial    = 105
	aiStartQuest      = 106
	aiLockID          = 107
	aiMaterial        = 108
	aiSheath          = 109
	aiRandomProperty  = 110
	aiRandomSuffix    = 111
	aiBlock           = 112
	aiItemSet         = 113
	aiMaxDurability   = 114
	aiArea            = 115
	aiMap             = 116
	aiBagFamily       = 117
	aiTotemCategory   = 118
	aiSocketColor1    = 119
	aiSocketContent1  = 120
	aiSocketColor2    = 121
	aiSocketContent2  = 122
	aiSocketColor3    = 123
	aiSocketContent3  = 124
	aiSocketBonus     = 125
	aiGemProperties   = 126
	aiReqDisenchant   = 127
	aiArmorDmgMod     = 128
	aiDuration        = 129
	aiItemLimitCat    = 130
	aiHolidayID       = 131
	// 132 = ScriptName
	aiDisenchantID    = 133
	aiFoodType        = 134
	aiMinMoneyLoot    = 135
	aiMaxMoneyLoot    = 136
	// 137 = flagsCustom
	// 138 = VerifiedBuild
	aiMinCols         = 139
)

func itemRowFromValues(vals []string) (database.WorldItemTemplate, error) {
	var it database.WorldItemTemplate
	if len(vals) < aiMinCols {
		return it, fmt.Errorf("item entry: expected >=%d columns, got %d", aiMinCols, len(vals))
	}

	it.Entry, _ = atoi32(vals[aiEntry])
	it.Class, _ = atoi32(vals[aiClass])
	it.Subclass, _ = atoi32(vals[aiSubclass])
	it.Name = vals[aiName]
	it.DisplayID, _ = atoi32(vals[aiDisplayID])
	it.Quality, _ = atoi32(vals[aiQuality])
	it.Flags, _ = atoi32(vals[aiFlags])
	it.BuyCount, _ = atoi32(vals[aiBuyCount])
	it.BuyPrice, _ = atoi32(vals[aiBuyPrice])
	it.SellPrice, _ = atoi32(vals[aiSellPrice])
	it.InventoryType, _ = atoi32(vals[aiInventoryType])
	it.AllowableClass, _ = atoi32(vals[aiAllowableClass])
	it.AllowableRace, _ = atoi32(vals[aiAllowableRace])
	it.ItemLevel, _ = atoi32(vals[aiItemLevel])
	it.RequiredLevel, _ = atoi32(vals[aiRequiredLevel])
	it.RequiredSkill, _ = atoi32(vals[aiRequiredSkill])
	it.RequiredSkillRank, _ = atoi32(vals[aiRequiredSkillRank])
	it.RequiredSpell, _ = atoi32(vals[aiRequiredSpell])
	it.RequiredHonorRank, _ = atoi32(vals[aiRequiredHonorRank])
	it.RequiredCityRank, _ = atoi32(vals[aiRequiredCityRank])
	it.RequiredReputationFaction, _ = atoi32(vals[aiRequiredRepFaction])
	it.RequiredReputationRank, _ = atoi32(vals[aiRequiredRepRank])
	it.MaxCount, _ = atoi32(vals[aiMaxCount])
	it.Stackable, _ = atoi32(vals[aiStackable])
	it.ContainerSlots, _ = atoi32(vals[aiContainerSlots])

	// Stats: 10 pairs starting at index 28
	for i := 0; i < 10; i++ {
		typ, _ := atoi32(vals[aiStatType1+i*2])
		val, _ := atoi32(vals[aiStatValue1+i*2])
		switch i {
		case 0: it.StatType1, it.StatValue1 = typ, val
		case 1: it.StatType2, it.StatValue2 = typ, val
		case 2: it.StatType3, it.StatValue3 = typ, val
		case 3: it.StatType4, it.StatValue4 = typ, val
		case 4: it.StatType5, it.StatValue5 = typ, val
		case 5: it.StatType6, it.StatValue6 = typ, val
		case 6: it.StatType7, it.StatValue7 = typ, val
		case 7: it.StatType8, it.StatValue8 = typ, val
		case 8: it.StatType9, it.StatValue9 = typ, val
		case 9: it.StatType10, it.StatValue10 = typ, val
		}
	}

	it.ScalingStatDistribution, _ = atoi32(vals[aiScalingStatDist])
	it.ScalingStatValue, _ = atoi32(vals[aiScalingStatVal])
	it.DmgMin1, _ = atof64(vals[aiDmgMin1])
	it.DmgMax1, _ = atof64(vals[aiDmgMax1])
	it.DmgType1, _ = atoi32(vals[aiDmgType1])
	it.DmgMin2, _ = atof64(vals[aiDmgMin2])
	it.DmgMax2, _ = atof64(vals[aiDmgMax2])
	it.DmgType2, _ = atoi32(vals[aiDmgType2])
	it.Armor, _ = atoi32(vals[aiArmor])
	it.HolyRes, _ = atoi32(vals[aiHolyRes])
	it.FireRes, _ = atoi32(vals[aiFireRes])
	it.NatureRes, _ = atoi32(vals[aiNatureRes])
	it.FrostRes, _ = atoi32(vals[aiFrostRes])
	it.ShadowRes, _ = atoi32(vals[aiShadowRes])
	it.ArcaneRes, _ = atoi32(vals[aiArcaneRes])
	it.Delay, _ = atoi32(vals[aiDelay])
	it.AmmoType, _ = atoi32(vals[aiAmmoType])
	it.RangeMod, _ = atof64(vals[aiRangedModRange])

	// Spells: 5 groups of 7 fields starting at index 66
	for i := 0; i < 5; i++ {
		base := aiSpellID1 + i*7
		sid, _ := atoi32(vals[base])
		trig, _ := atoi32(vals[base+1])
		chg, _ := atoi32(vals[base+2])
		ppm, _ := atof64(vals[base+3])
		cd, _ := atoi32(vals[base+4])
		cat, _ := atoi32(vals[base+5])
		catcd, _ := atoi32(vals[base+6])
		switch i {
		case 0:
			it.Spellid1, it.Spelltrigger1, it.Spellcharges1 = sid, trig, chg
			it.Spellppmrate1, it.Spellcooldown1, it.Spellcategory1, it.Spellcategorycooldown1 = ppm, cd, cat, catcd
		case 1:
			it.Spellid2, it.Spelltrigger2, it.Spellcharges2 = sid, trig, chg
			it.Spellppmrate2, it.Spellcooldown2, it.Spellcategory2, it.Spellcategorycooldown2 = ppm, cd, cat, catcd
		case 2:
			it.Spellid3, it.Spelltrigger3, it.Spellcharges3 = sid, trig, chg
			it.Spellppmrate3, it.Spellcooldown3, it.Spellcategory3, it.Spellcategorycooldown3 = ppm, cd, cat, catcd
		case 3:
			it.Spellid4, it.Spelltrigger4, it.Spellcharges4 = sid, trig, chg
			it.Spellppmrate4, it.Spellcooldown4, it.Spellcategory4, it.Spellcategorycooldown4 = ppm, cd, cat, catcd
		case 4:
			it.Spellid5, it.Spelltrigger5, it.Spellcharges5 = sid, trig, chg
			it.Spellppmrate5, it.Spellcooldown5, it.Spellcategory5, it.Spellcategorycooldown5 = ppm, cd, cat, catcd
		}
	}

	it.Bonding, _ = atoi32(vals[aiBonding])
	it.Description = vals[aiDescription]
	it.PageText, _ = atoi32(vals[aiPageText])
	it.PageLanguage, _ = atoi32(vals[aiLanguageID])
	it.PageMaterial, _ = atoi32(vals[aiPageMaterial])
	it.StartQuest, _ = atoi32(vals[aiStartQuest])
	it.LockID, _ = atoi32(vals[aiLockID])
	it.Material, _ = atoi32(vals[aiMaterial])
	it.Sheath, _ = atoi32(vals[aiSheath])
	it.RandomProperty, _ = atoi32(vals[aiRandomProperty])
	it.RandomSuffix, _ = atoi32(vals[aiRandomSuffix])
	it.Block, _ = atoi32(vals[aiBlock])
	it.SetID, _ = atoi32(vals[aiItemSet])
	it.MaxDurability, _ = atoi32(vals[aiMaxDurability])
	it.AreaBound, _ = atoi32(vals[aiArea])
	it.MapBound, _ = atoi32(vals[aiMap])
	it.BagFamily, _ = atoi32(vals[aiBagFamily])
	it.TotemCategory, _ = atoi32(vals[aiTotemCategory])
	it.SocketColor1, _ = atoi32(vals[aiSocketColor1])
	it.SocketContent1, _ = atoi32(vals[aiSocketContent1])
	it.SocketColor2, _ = atoi32(vals[aiSocketColor2])
	it.SocketContent2, _ = atoi32(vals[aiSocketContent2])
	it.SocketColor3, _ = atoi32(vals[aiSocketColor3])
	it.SocketContent3, _ = atoi32(vals[aiSocketContent3])
	it.SocketBonus, _ = atoi32(vals[aiSocketBonus])
	it.GemProperties, _ = atoi32(vals[aiGemProperties])
	it.RequiredDisenchantSkill, _ = atoi32(vals[aiReqDisenchant])
	it.ArmorDamageModifier, _ = atof64(vals[aiArmorDmgMod])
	it.Duration, _ = atoi32(vals[aiDuration])
	it.ItemLimitCategory, _ = atoi32(vals[aiItemLimitCat])
	it.HolidayID, _ = atoi32(vals[aiHolidayID])
	it.DisenchantID, _ = atoi32(vals[aiDisenchantID])
	it.FoodType, _ = atoi32(vals[aiFoodType])
	it.MinMoneyLoot, _ = atoi32(vals[aiMinMoneyLoot])
	it.MaxMoneyLoot, _ = atoi32(vals[aiMaxMoneyLoot])

	return it, nil
}

func atoi32(s string) (int32, error) {
	// Handle float values like "422.5" by truncating
	if strings.Contains(s, ".") {
		f, err := strconv.ParseFloat(s, 64)
		return int32(f), err
	}
	v, err := strconv.ParseInt(s, 10, 32)
	return int32(v), err
}

func atoi64(s string) (int64, error) {
	v, err := strconv.ParseInt(s, 10, 64)
	return v, err
}

func atof64(s string) (float64, error) {
	return strconv.ParseFloat(s, 64)
}

func unquote(s string) string {
	// Values from parseOneValue are already unquoted/unescaped for strings
	return s
}
