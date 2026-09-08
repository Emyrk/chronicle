package v9

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

const advancedCombatFields = 18

type transformReader struct {
	scanner *bufio.Scanner
	guids   *guidNormalizer
	names   map[string]string
	buf     bytes.Buffer
	err     error
}

func newTransformReader(r io.Reader) *transformReader {
	return &transformReader{
		scanner: bufio.NewScanner(r),
		guids:   newGUIDNormalizer(),
		names:   make(map[string]string),
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
		return "", fmt.Errorf("v9 CLEU line has no separator: %q", truncate(line, 100))
	}
	ts, err := parseTimestamp(line[:idx])
	if err != nil {
		return "", err
	}
	prefix := ts.UTC().Format("1/2 15:04:05.000") + "  "
	fields := splitTopLevel(line[idx+2:])
	if len(fields) == 0 {
		return "", nil
	}
	event := fields[0]
	args := fields[1:]

	switch event {
	case "COMBAT_LOG_VERSION":
		return prefix + "V9_COMBAT_LOG_VERSION," + strings.Join(args, ","), nil
	case "ZONE_CHANGE":
		return prefix + "V9_ZONE_CHANGE," + strings.Join(args, ","), nil
	case "COMBATANT_INFO":
		if len(args) == 0 {
			return "", fmt.Errorf("v9 COMBATANT_INFO missing player GUID")
		}
		player, err := r.guids.normalize(args[0])
		if err != nil {
			return "", err
		}
		encoded := base64.RawStdEncoding.EncodeToString([]byte(strings.Join(args, ",")))
		return prefix + "V9_COMBATANT_INFO," + player + "," + strconv.Quote(r.names[args[0]]) + "," + encoded, nil
	case "SPELL_ABSORBED":
		return r.transformAbsorbed(prefix, args)
	case "MAP_CHANGE", "ENCOUNTER_START", "ENCOUNTER_END", "EMOTE", "SWING_DAMAGE_LANDED":
		return "", nil
	}

	if len(args) < 8 {
		return prefix + event + "," + strings.Join(args, ","), nil
	}

	base := make([]string, 0, 6)
	if strings.HasPrefix(args[0], "Player-") && args[1] != "nil" {
		r.names[args[0]] = strings.Trim(args[1], "\"")
	}
	if strings.HasPrefix(args[4], "Player-") && args[5] != "nil" {
		r.names[args[4]] = strings.Trim(args[5], "\"")
	}
	source, err := r.guids.normalize(args[0])
	if err != nil {
		return "", err
	}
	dest, err := r.guids.normalize(args[4])
	if err != nil {
		return "", err
	}
	base = append(base, source, args[1], args[2], dest, args[5], args[6])

	body := args[8:]
	spellPrefix := eventHasSpellPrefix(event)
	var spell []string
	if spellPrefix {
		if len(body) < 3 {
			return "", fmt.Errorf("v9 CLEU %s missing spell prefix", event)
		}
		spell = body[:3]
		body = body[3:]
	}

	if len(body) >= advancedCombatFields && isModernGUID(body[0]) {
		body = body[advancedCombatFields:]
	}
	body, err = normalizeSuffix(event, body)
	if err != nil {
		return "", err
	}

	out := append(base, spell...)
	out = append(out, body...)
	return prefix + event + "," + strings.Join(out, ","), nil
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
	return prefix + "V9_SPELL_ABSORBED," + strings.Join([]string{
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

func normalizeSuffix(event string, fields []string) ([]string, error) {
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
		return time.Time{}, fmt.Errorf("v9 CLEU timestamp %q has no UTC offset", raw)
	}
	offsetHours, err := strconv.Atoi(raw[offsetAt:])
	if err != nil {
		return time.Time{}, fmt.Errorf("parse v9 CLEU UTC offset in %q: %w", raw, err)
	}
	wall, err := time.Parse("1/2/2006 15:04:05.000", raw[:offsetAt])
	if err != nil {
		return time.Time{}, fmt.Errorf("parse v9 CLEU timestamp %q: %w", raw, err)
	}
	location := time.FixedZone("v9-cleu", offsetHours*60*60)
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
