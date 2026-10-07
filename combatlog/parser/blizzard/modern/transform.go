package modern

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// Blizzard v22 layouts are documented at https://wowcoach.gg/docs/combat-log.
const (
	v9AdvancedCombatFields  = 18
	v22AdvancedCombatFields = 19
)

type advancedCombatSnapshot struct {
	unit          string
	currentHealth int64
	maximumHealth int64
	attackPower   int32
	spellPower    int32
	armor         int32
	absorb        int32
	powerType     int32
	currentPower  int32
	maximumPower  int32
	x             float64
	y             float64
	mapID         int32
	facing        float64
}

type transformReader struct {
	scanner                     *bufio.Scanner
	guids                       *guidNormalizer
	names                       map[string]string
	preserveTimestamp           bool
	trimPlayerNameSuffix        bool
	combatLogVersion            int
	advancedCombatFields        int
	preserveAdvancedFieldLayout bool
	buf                         bytes.Buffer
	err                         error
}

func newTransformReader(r io.Reader) *transformReader {
	return newTransformReaderWithOptions(r, false, true, v9AdvancedCombatFields)
}

func newHermesProxyTransformReader(r io.Reader) *transformReader {
	reader := newTransformReaderWithOptions(r, true, true, 16)
	// HermesProxy emits 16 advanced fields even when the client records version 9.
	reader.preserveAdvancedFieldLayout = true
	return reader
}

func newTransformReaderWithOptions(r io.Reader, preserveTimestamp, trimPlayerNameSuffix bool, advancedFields int) *transformReader {
	return &transformReader{
		scanner:              bufio.NewScanner(r),
		guids:                newGUIDNormalizer(),
		names:                make(map[string]string),
		preserveTimestamp:    preserveTimestamp,
		trimPlayerNameSuffix: trimPlayerNameSuffix,
		advancedCombatFields: advancedFields,
	}
}

func (r *transformReader) Read(p []byte) (int, error) {
	for r.buf.Len() == 0 && r.err == nil {
		if !r.scanner.Scan() {
			r.err = r.scanner.Err()
			if r.err == nil {
				r.err = io.EOF
			}
			break
		}
		line := strings.TrimSpace(r.scanner.Text())
		if line == "" {
			continue
		}
		converted, err := r.transform(line)
		if err != nil {
			r.err = err
			break
		}
		if converted != "" {
			r.buf.WriteString(converted)
			r.buf.WriteByte('\n')
		}
	}
	if r.buf.Len() > 0 {
		return r.buf.Read(p)
	}
	return 0, r.err
}

func (r *transformReader) transform(line string) (string, error) {
	idx := strings.Index(line, "  ")
	if idx < 0 {
		return "", fmt.Errorf("modern Blizzard CLEU line has no separator: %q", truncate(line, 100))
	}
	prefix := line[:idx+2]
	if !r.preserveTimestamp {
		ts, err := parseTimestamp(line[:idx])
		if err != nil {
			return "", err
		}
		prefix = ts.UTC().Format("1/2 15:04:05.000") + "  "
	}
	fields := splitTopLevel(line[idx+2:])
	if len(fields) == 0 {
		return "", nil
	}
	event := fields[0]
	args := fields[1:]

	switch event {
	case "COMBAT_LOG_VERSION":
		if err := r.configureCombatLogVersion(args); err != nil {
			return "", err
		}
		return prefix + "BLIZZARD_COMBAT_LOG_VERSION," + strings.Join(args, ","), nil
	case "ZONE_CHANGE":
		return prefix + "BLIZZARD_ZONE_CHANGE," + strings.Join(args, ","), nil
	case "COMBATANT_INFO":
		if len(args) == 0 {
			return "", fmt.Errorf("blizzard COMBATANT_INFO missing player GUID")
		}
		player, err := r.guids.normalize(args[0])
		if err != nil {
			return "", err
		}
		encoded := base64.RawStdEncoding.EncodeToString([]byte(strings.Join(args, ",")))
		return prefix + "BLIZZARD_COMBATANT_INFO," + player + "," + strconv.Quote(r.names[args[0]]) + "," + encoded, nil
	case "SPELL_ABSORBED":
		return r.transformAbsorbed(prefix, args)
	case "ENCOUNTER_START":
		return prefix + "BLIZZARD_ENCOUNTER_START," + strings.Join(args, ","), nil
	case "ENCOUNTER_END":
		return prefix + "BLIZZARD_ENCOUNTER_END," + strings.Join(args, ","), nil
	case "WORLD_MARKER_PLACED":
		return prefix + "BLIZZARD_WORLD_MARKER_PLACED," + strings.Join(args, ","), nil
	case "WORLD_MARKER_REMOVED":
		return prefix + "BLIZZARD_WORLD_MARKER_REMOVED," + strings.Join(args, ","), nil
	case "MAP_CHANGE", "EMOTE":
		return "", nil
	}

	if len(args) < 8 {
		return prefix + event + "," + strings.Join(args, ","), nil
	}

	base := make([]string, 0, 6)
	sourceName := r.normalizeUnitName(args[0], args[1])
	destName := r.normalizeUnitName(args[4], args[5])
	if strings.HasPrefix(args[0], "Player-") && sourceName != "nil" {
		r.names[args[0]] = strings.Trim(sourceName, "\"")
	}
	if strings.HasPrefix(args[4], "Player-") && destName != "nil" {
		r.names[args[4]] = strings.Trim(destName, "\"")
	}
	source, err := r.guids.normalize(args[0])
	if err != nil {
		return "", err
	}
	dest, err := r.guids.normalize(args[4])
	if err != nil {
		return "", err
	}
	base = append(base, source, sourceName, args[2], dest, destName, args[6])

	body := args[8:]
	spellPrefix := eventHasSpellPrefix(event)
	var spell []string
	if spellPrefix {
		if len(body) < 3 {
			return "", fmt.Errorf("modern Blizzard CLEU %s missing spell prefix", event)
		}
		spell = body[:3]
		body = body[3:]
	}

	var snapshot *advancedCombatSnapshot
	if len(body) >= r.advancedCombatFields && isModernGUID(body[0]) {
		if r.combatLogVersion == 22 {
			snapshot, err = r.parseAdvancedCombatSnapshot(body[:r.advancedCombatFields], args[0], args[4])
			if err != nil {
				return "", err
			}
		}
		body = body[r.advancedCombatFields:]
	}
	body, err = r.normalizeSuffix(event, body)
	if err != nil {
		return "", err
	}
	if event == "SPELL_CAST_FAILED" && len(body) > 0 {
		body[len(body)-1], err = r.normalizeCompanionGUIDs(body[len(body)-1])
		if err != nil {
			return "", err
		}
	}

	out := append(base, spell...)
	out = append(out, body...)
	converted := prefix + event + "," + strings.Join(out, ",")
	if event == "SWING_DAMAGE_LANDED" {
		converted = ""
	}
	if snapshot == nil {
		return converted, nil
	}

	telemetry := snapshot.lines(prefix)
	if converted == "" {
		return strings.Join(telemetry, "\n"), nil
	}
	return strings.Join(append([]string{converted}, telemetry...), "\n"), nil
}

// parseAdvancedCombatSnapshot uses infoGUID as the authoritative subject. WoW
// Forever v22 cast events can describe the source, while landed damage and heal
// events, including SWING_DAMAGE_LANDED, can describe the target. Checking both
// event units avoids coupling the snapshot to either header position.
func (r *transformReader) parseAdvancedCombatSnapshot(fields []string, sourceGUID, targetGUID string) (*advancedCombatSnapshot, error) {
	if len(fields) != v22AdvancedCombatFields {
		return nil, fmt.Errorf("modern v22 advanced combat block has %d fields", len(fields))
	}
	if fields[0] != sourceGUID && fields[0] != targetGUID {
		return nil, fmt.Errorf("modern v22 advanced combat GUID %q does not match source or target", fields[0])
	}

	unit, err := r.guids.normalize(fields[0])
	if err != nil {
		return nil, err
	}
	parseInt64 := func(index int, name string) (int64, error) {
		value, parseErr := strconv.ParseInt(fields[index], 10, 64)
		if parseErr != nil {
			return 0, fmt.Errorf("parse advanced combat %s %q: %w", name, fields[index], parseErr)
		}
		return value, nil
	}
	parseInt32 := func(index int, name string) (int32, error) {
		value, parseErr := strconv.ParseInt(fields[index], 10, 32)
		if parseErr != nil {
			return 0, fmt.Errorf("parse advanced combat %s %q: %w", name, fields[index], parseErr)
		}
		return int32(value), nil
	}
	parsePrimaryInt32 := func(index int, name string) (int32, error) {
		// WoW Forever can report parallel primary and secondary resource values
		// separated by pipes, for example energy/combo points as "3|4" and
		// "33|4". UnitResources intentionally exposes only the primary resource.
		primary, _, _ := strings.Cut(fields[index], "|")
		value, parseErr := strconv.ParseInt(primary, 10, 32)
		if parseErr != nil {
			return 0, fmt.Errorf("parse advanced combat %s %q: %w", name, fields[index], parseErr)
		}
		return int32(value), nil
	}
	parseFloat64 := func(index int, name string) (float64, error) {
		value, parseErr := strconv.ParseFloat(fields[index], 64)
		if parseErr != nil {
			return 0, fmt.Errorf("parse advanced combat %s %q: %w", name, fields[index], parseErr)
		}
		return value, nil
	}

	snapshot := &advancedCombatSnapshot{unit: unit}
	if snapshot.currentHealth, err = parseInt64(2, "current health"); err != nil {
		return nil, err
	}
	if snapshot.maximumHealth, err = parseInt64(3, "maximum health"); err != nil {
		return nil, err
	}
	if snapshot.attackPower, err = parseInt32(4, "attack power"); err != nil {
		return nil, err
	}
	if snapshot.spellPower, err = parseInt32(5, "spell power"); err != nil {
		return nil, err
	}
	if snapshot.armor, err = parseInt32(6, "armor"); err != nil {
		return nil, err
	}
	if snapshot.absorb, err = parseInt32(7, "absorb"); err != nil {
		return nil, err
	}
	if snapshot.powerType, err = parsePrimaryInt32(10, "power type"); err != nil {
		return nil, err
	}
	if snapshot.currentPower, err = parsePrimaryInt32(11, "current power"); err != nil {
		return nil, err
	}
	if snapshot.maximumPower, err = parsePrimaryInt32(12, "maximum power"); err != nil {
		return nil, err
	}
	if snapshot.x, err = parseFloat64(14, "x position"); err != nil {
		return nil, err
	}
	if snapshot.y, err = parseFloat64(15, "y position"); err != nil {
		return nil, err
	}
	if snapshot.mapID, err = parseInt32(16, "map ID"); err != nil {
		return nil, err
	}
	if snapshot.facing, err = parseFloat64(17, "facing"); err != nil {
		return nil, err
	}
	return snapshot, nil
}

func (s advancedCombatSnapshot) lines(prefix string) []string {
	return []string{
		prefix + "BLIZZARD_UNIT_POSITION," + strings.Join([]string{
			s.unit,
			strconv.FormatFloat(s.x, 'f', -1, 64),
			strconv.FormatFloat(s.y, 'f', -1, 64),
			strconv.FormatInt(int64(s.mapID), 10),
			strconv.FormatFloat(s.facing, 'f', -1, 64),
		}, ","),
		prefix + "BLIZZARD_UNIT_RESOURCES," + strings.Join([]string{
			s.unit,
			strconv.FormatInt(s.currentHealth, 10),
			strconv.FormatInt(s.maximumHealth, 10),
			strconv.FormatInt(int64(s.absorb), 10),
			strconv.FormatInt(int64(s.powerType), 10),
			strconv.FormatInt(int64(s.currentPower), 10),
			strconv.FormatInt(int64(s.maximumPower), 10),
			strconv.FormatInt(int64(s.attackPower), 10),
			strconv.FormatInt(int64(s.spellPower), 10),
			strconv.FormatInt(int64(s.armor), 10),
		}, ","),
	}
}

func (r *transformReader) configureCombatLogVersion(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("COMBAT_LOG_VERSION missing version")
	}
	version, err := strconv.Atoi(args[0])
	if err != nil {
		return fmt.Errorf("parse COMBAT_LOG_VERSION %q: %w", args[0], err)
	}
	r.combatLogVersion = version
	switch version {
	case 9:
		if !r.preserveAdvancedFieldLayout {
			r.advancedCombatFields = v9AdvancedCombatFields
		}
	case 22:
		if !r.preserveAdvancedFieldLayout {
			r.advancedCombatFields = v22AdvancedCombatFields
		}
	default:
		return fmt.Errorf("unsupported Blizzard combat log version %d", version)
	}
	return nil
}

func (r *transformReader) normalizeUnitName(rawGUID, quotedName string) string {
	if !r.trimPlayerNameSuffix || !strings.HasPrefix(rawGUID, "Player-") || quotedName == "nil" {
		return quotedName
	}
	name, err := strconv.Unquote(quotedName)
	if err != nil {
		return quotedName
	}
	if r.combatLogVersion == 22 {
		return strconv.Quote(stripRealm(name))
	}
	return strconv.Quote(strings.TrimSuffix(name, "-"))
}

func (r *transformReader) normalizeCompanionGUIDs(field string) (string, error) {
	prefixes := []string{"Player-", "Creature-", "Pet-", "Vehicle-", "GameObject-", "Corpse-"}
	var out strings.Builder
	for pos := 0; pos < len(field); {
		start := -1
		for _, prefix := range prefixes {
			if strings.HasPrefix(field[pos:], prefix) {
				start = pos
				break
			}
		}
		if start < 0 {
			out.WriteByte(field[pos])
			pos++
			continue
		}

		end := start
		for end < len(field) && field[end] != ';' && field[end] != ',' && field[end] != ']' && field[end] != '}' && field[end] != '"' {
			end++
		}
		normalized, err := r.guids.normalize(field[start:end])
		if err != nil {
			return "", fmt.Errorf("normalize companion GUID: %w", err)
		}
		out.WriteString(normalized)
		pos = end
	}
	return out.String(), nil
}

func (r *transformReader) transformAbsorbed(prefix string, args []string) (string, error) {
	validLength := len(args) == 17 || len(args) == 20
	if r.combatLogVersion == 22 {
		// V22 appends an additional field after the absorbed amount.
		validLength = len(args) == 18 || len(args) == 21
	}
	if !validLength {
		return "", fmt.Errorf("modern SPELL_ABSORBED has %d fields for version %d", len(args), r.combatLogVersion)
	}
	attacker, err := r.guids.normalize(args[0])
	if err != nil {
		return "", err
	}
	target, err := r.guids.normalize(args[4])
	if err != nil {
		return "", err
	}
	index := 8
	damageSpellID := "0"
	if len(args) == 20 || len(args) == 21 {
		damageSpellID = args[index]
		index += 3
	}
	caster, err := r.guids.normalize(args[index])
	if err != nil {
		return "", err
	}
	absorbSpellID := args[index+4]
	absorbSpellName := args[index+5]
	absorbSchool := args[index+6]
	amount := args[index+7]
	return prefix + "BLIZZARD_SPELL_ABSORBED," + strings.Join([]string{
		attacker, target, damageSpellID, caster, absorbSpellID,
		absorbSpellName, absorbSchool, amount,
	}, ","), nil
}

func eventHasSpellPrefix(event string) bool {
	return strings.HasPrefix(event, "SPELL_") || strings.HasPrefix(event, "RANGE_") ||
		strings.HasPrefix(event, "DAMAGE_SHIELD") || strings.HasPrefix(event, "DAMAGE_SPLIT")
}

func isModernGUID(s string) bool {
	return s == "0000000000000000" || strings.HasPrefix(s, "Player-") ||
		strings.HasPrefix(s, "Creature-") || strings.HasPrefix(s, "Pet-") ||
		strings.HasPrefix(s, "Vehicle-") || strings.HasPrefix(s, "GameObject-") ||
		strings.HasPrefix(s, "Corpse-")
}

func (r *transformReader) normalizeSuffix(event string, fields []string) ([]string, error) {
	switch {
	case event == "ENVIRONMENTAL_DAMAGE":
		if len(fields) >= 11 {
			damage := normalizeDamage(fields[1:])
			return append([]string{fields[0]}, damage...), nil
		}
	case strings.HasSuffix(event, "_DAMAGE") || event == "SWING_DAMAGE" ||
		event == "DAMAGE_SHIELD" || event == "DAMAGE_SPLIT":
		if len(fields) >= 10 {
			return normalizeDamage(fields), nil
		}
	case strings.HasSuffix(event, "_HEAL"):
		if len(fields) >= 5 {
			if r.combatLogVersion == 22 {
				// v22: healedToHP, amount, overhealing, absorbedToShield, critical.
				return []string{fields[1], fields[2], fields[3], fields[4]}, nil
			}
			// v9: amount, effectiveAmount, overhealing, absorbed, critical.
			return []string{fields[0], fields[2], fields[3], fields[4]}, nil
		}
	case strings.HasSuffix(event, "_ENERGIZE"):
		if len(fields) >= 3 {
			amount, err := strconv.ParseFloat(fields[0], 64)
			if err != nil {
				return nil, fmt.Errorf("parse v9 energize amount %q: %w", fields[0], err)
			}
			return []string{strconv.FormatInt(int64(amount), 10), fields[2]}, nil
		}
	case strings.HasSuffix(event, "_DRAIN"), strings.HasSuffix(event, "_LEECH"):
		if len(fields) >= 3 {
			return []string{fields[0], fields[2], "0"}, nil
		}
	}
	return fields, nil
}

func normalizeDamage(fields []string) []string {
	// v9: amount, originalAmount, overkill, school, resisted, blocked,
	// absorbed, critical, glancing, crushing, ...
	return []string{fields[0], fields[2], fields[3], fields[4], fields[5], fields[6], fields[7], fields[8], fields[9]}
}

func parseTimestamp(raw string) (time.Time, error) {
	offsetAt := strings.LastIndexAny(raw, "+-")
	if offsetAt < 0 {
		return time.Time{}, fmt.Errorf("modern Blizzard CLEU timestamp %q has no UTC offset", raw)
	}
	offsetHours, err := strconv.Atoi(raw[offsetAt:])
	if err != nil {
		return time.Time{}, fmt.Errorf("parse modern Blizzard CLEU UTC offset in %q: %w", raw, err)
	}
	wall, err := time.Parse("1/2/2006 15:04:05.000", raw[:offsetAt])
	if err != nil {
		return time.Time{}, fmt.Errorf("parse modern Blizzard CLEU timestamp %q: %w", raw, err)
	}
	location := time.FixedZone("modern Blizzard CLEU", offsetHours*60*60)
	return time.Date(wall.Year(), wall.Month(), wall.Day(), wall.Hour(), wall.Minute(), wall.Second(), wall.Nanosecond(), location), nil
}

func splitTopLevel(s string) []string {
	fields := make([]string, 0, 32)
	start, depth := 0, 0
	quoted := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			quoted = !quoted
		case '(', '[':
			if !quoted {
				depth++
			}
		case ')', ']':
			if !quoted && depth > 0 {
				depth--
			}
		case ',':
			if !quoted && depth == 0 {
				fields = append(fields, strings.TrimSpace(s[start:i]))
				start = i + 1
			}
		}
	}
	fields = append(fields, strings.TrimSpace(s[start:]))
	return fields
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
