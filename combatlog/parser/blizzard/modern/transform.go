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

type transformReader struct {
	scanner              *bufio.Scanner
	guids                *guidNormalizer
	names                map[string]string
	preserveTimestamp    bool
	trimPlayerNameSuffix bool
	combatLogVersion     int
	advancedCombatFields int
	buf                  bytes.Buffer
	err                  error
}

func newTransformReader(r io.Reader) *transformReader {
	return newTransformReaderWithOptions(r, false, true, v9AdvancedCombatFields)
}

func newHermesProxyTransformReader(r io.Reader) *transformReader {
	return newTransformReaderWithOptions(r, true, true, 16)
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
	case "MAP_CHANGE", "EMOTE", "SWING_DAMAGE_LANDED":
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

	if len(body) >= r.advancedCombatFields && isModernGUID(body[0]) {
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
	return prefix + event + "," + strings.Join(out, ","), nil
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
		r.advancedCombatFields = v9AdvancedCombatFields
	case 22:
		r.advancedCombatFields = v22AdvancedCombatFields
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
	if len(args) != 17 && len(args) != 20 {
		return "", fmt.Errorf("v9 SPELL_ABSORBED has %d fields", len(args))
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
	if len(args) == 20 {
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
