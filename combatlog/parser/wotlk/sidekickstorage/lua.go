package sidekickstorage

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

type luaKind uint8

const (
	luaNil luaKind = iota
	luaString
	luaNumber
	luaBool
	luaTable
)

type luaValue struct {
	kind   luaKind
	text   string
	bool   bool
	fields map[string]luaValue
	array  []luaValue
}

type luaParser struct {
	input   string
	pos     int
	depth   int
	entries int
}

func parseSavedVariables(input string) (luaValue, error) {
	p := &luaParser{input: input}
	for {
		if err := p.space(); err != nil {
			return luaValue{}, err
		}
		if p.pos == len(p.input) {
			return luaValue{}, fmt.Errorf("ChronicleCompanionWoTLKDB assignment not found")
		}
		name, err := p.identifier()
		if err != nil {
			return luaValue{}, fmt.Errorf("saved variables assignment: %w", err)
		}
		if err := p.space(); err != nil {
			return luaValue{}, err
		}
		if !p.take('=') {
			return luaValue{}, fmt.Errorf("saved variables assignment %q: expected =", name)
		}
		value, err := p.value()
		if err != nil {
			return luaValue{}, fmt.Errorf("saved variables assignment %q: %w", name, err)
		}
		if name == "ChronicleCompanionWoTLKDB" {
			if value.kind != luaTable {
				return luaValue{}, fmt.Errorf("ChronicleCompanionWoTLKDB must be a table")
			}
			return value, nil
		}
		if err := p.space(); err != nil {
			return luaValue{}, err
		}
		p.take(';')
	}
}

func (p *luaParser) value() (luaValue, error) {
	if err := p.space(); err != nil {
		return luaValue{}, err
	}
	if p.pos >= len(p.input) {
		return luaValue{}, fmt.Errorf("unexpected end of input")
	}
	switch p.input[p.pos] {
	case '{':
		return p.table()
	case '\'', '"':
		s, err := p.quotedString()
		return luaValue{kind: luaString, text: s}, err
	}
	if isIdentStart(p.input[p.pos]) {
		word, err := p.identifier()
		if err != nil {
			return luaValue{}, err
		}
		switch word {
		case "true":
			return luaValue{kind: luaBool, bool: true}, nil
		case "false":
			return luaValue{kind: luaBool}, nil
		case "nil":
			return luaValue{kind: luaNil}, nil
		default:
			return luaValue{}, fmt.Errorf("unsupported identifier value %q", word)
		}
	}
	if p.input[p.pos] == '-' || p.input[p.pos] >= '0' && p.input[p.pos] <= '9' {
		start := p.pos
		if p.input[p.pos] == '-' {
			p.pos++
		}
		digits := p.pos
		for p.pos < len(p.input) && p.input[p.pos] >= '0' && p.input[p.pos] <= '9' {
			p.pos++
		}
		if p.pos == digits {
			return luaValue{}, fmt.Errorf("invalid number at byte %d", start)
		}
		if p.pos < len(p.input) && p.input[p.pos] == '.' {
			p.pos++
			for p.pos < len(p.input) && p.input[p.pos] >= '0' && p.input[p.pos] <= '9' {
				p.pos++
			}
		}
		if p.pos < len(p.input) && (p.input[p.pos] == 'e' || p.input[p.pos] == 'E') {
			p.pos++
			if p.pos < len(p.input) && (p.input[p.pos] == '+' || p.input[p.pos] == '-') {
				p.pos++
			}
			exponent := p.pos
			for p.pos < len(p.input) && p.input[p.pos] >= '0' && p.input[p.pos] <= '9' {
				p.pos++
			}
			if p.pos == exponent {
				return luaValue{}, fmt.Errorf("invalid number exponent at byte %d", start)
			}
		}
		return luaValue{kind: luaNumber, text: p.input[start:p.pos]}, nil
	}
	return luaValue{}, fmt.Errorf("unsupported value at byte %d", p.pos)
}

func (p *luaParser) table() (luaValue, error) {
	p.depth++
	defer func() { p.depth-- }()
	if p.depth > 32 {
		return luaValue{}, fmt.Errorf("table nesting exceeds 32")
	}
	p.pos++
	result := luaValue{kind: luaTable, fields: make(map[string]luaValue)}
	for {
		if err := p.space(); err != nil {
			return luaValue{}, err
		}
		if p.take('}') {
			return result, nil
		}
		p.entries++
		if p.entries > 500000 {
			return luaValue{}, fmt.Errorf("table entry limit exceeded")
		}

		var key string
		keyed := false
		bracketKey := false
		if p.take('[') {
			bracketKey = true
			keyValue, err := p.value()
			if err != nil {
				return luaValue{}, fmt.Errorf("table key: %w", err)
			}
			if err := p.space(); err != nil {
				return luaValue{}, err
			}
			if !p.take(']') {
				return luaValue{}, fmt.Errorf("table key: expected ]")
			}
			if keyValue.kind == luaString || keyValue.kind == luaNumber {
				key = keyValue.text
			} else {
				return luaValue{}, fmt.Errorf("table key must be string or integer")
			}
			keyed = true
		} else if p.pos < len(p.input) && isIdentStart(p.input[p.pos]) {
			saved := p.pos
			identifier, err := p.identifier()
			if err != nil {
				return luaValue{}, err
			}
			if err := p.space(); err != nil {
				return luaValue{}, err
			}
			if p.take('=') {
				key, keyed = identifier, true
			} else {
				p.pos = saved
			}
		}
		if keyed {
			if bracketKey {
				if err := p.space(); err != nil {
					return luaValue{}, err
				}
				if !p.take('=') {
					return luaValue{}, fmt.Errorf("table field %q: expected =", key)
				}
			}
			value, err := p.value()
			if err != nil {
				return luaValue{}, fmt.Errorf("table field %q: %w", key, err)
			}
			if _, exists := result.fields[key]; exists {
				return luaValue{}, fmt.Errorf("duplicate table field %q", key)
			}
			result.fields[key] = value
		} else {
			value, err := p.value()
			if err != nil {
				return luaValue{}, err
			}
			result.array = append(result.array, value)
		}
		if err := p.space(); err != nil {
			return luaValue{}, err
		}
		if p.take(',') || p.take(';') {
			continue
		}
		if p.pos >= len(p.input) || p.input[p.pos] != '}' {
			return luaValue{}, fmt.Errorf("table: expected separator or }")
		}
	}
}

func (p *luaParser) identifier() (string, error) {
	if p.pos >= len(p.input) || !isIdentStart(p.input[p.pos]) {
		return "", fmt.Errorf("expected identifier at byte %d", p.pos)
	}
	start := p.pos
	p.pos++
	for p.pos < len(p.input) && (isIdentStart(p.input[p.pos]) || p.input[p.pos] >= '0' && p.input[p.pos] <= '9') {
		p.pos++
	}
	return p.input[start:p.pos], nil
}

func (p *luaParser) quotedString() (string, error) {
	quote := p.input[p.pos]
	p.pos++
	var result strings.Builder
	for p.pos < len(p.input) {
		ch := p.input[p.pos]
		p.pos++
		if ch == quote {
			return result.String(), nil
		}
		if ch != '\\' {
			if ch == '\n' || ch == '\r' {
				return "", fmt.Errorf("newline in quoted string")
			}
			result.WriteByte(ch)
			continue
		}
		if p.pos >= len(p.input) {
			return "", fmt.Errorf("unterminated string escape")
		}
		escape := p.input[p.pos]
		p.pos++
		switch escape {
		case 'a':
			result.WriteByte('\a')
		case 'b':
			result.WriteByte('\b')
		case 'f':
			result.WriteByte('\f')
		case 'n':
			result.WriteByte('\n')
		case 'r':
			result.WriteByte('\r')
		case 't':
			result.WriteByte('\t')
		case 'v':
			result.WriteByte('\v')
		case '\\', '\'', '"':
			result.WriteByte(escape)
		case '\n':
			result.WriteByte('\n')
		case '\r':
			if p.pos < len(p.input) && p.input[p.pos] == '\n' {
				p.pos++
			}
			result.WriteByte('\n')
		case 'z':
			for p.pos < len(p.input) && unicode.IsSpace(rune(p.input[p.pos])) {
				p.pos++
			}
		default:
			if escape < '0' || escape > '9' {
				return "", fmt.Errorf("unsupported string escape \\%c", escape)
			}
			digits := []byte{escape}
			for len(digits) < 3 && p.pos < len(p.input) && p.input[p.pos] >= '0' && p.input[p.pos] <= '9' {
				digits = append(digits, p.input[p.pos])
				p.pos++
			}
			value, _ := strconv.ParseUint(string(digits), 10, 8)
			result.WriteByte(byte(value))
		}
	}
	return "", fmt.Errorf("unterminated quoted string")
}

func (p *luaParser) space() error {
	for {
		for p.pos < len(p.input) && unicode.IsSpace(rune(p.input[p.pos])) {
			p.pos++
		}
		if p.pos+1 >= len(p.input) || p.input[p.pos:p.pos+2] != "--" {
			return nil
		}
		p.pos += 2
		if p.pos+1 < len(p.input) && p.input[p.pos:p.pos+2] == "[[" {
			end := strings.Index(p.input[p.pos+2:], "]]")
			if end < 0 {
				return fmt.Errorf("unterminated long comment")
			}
			p.pos += 2 + end + 2
			continue
		}
		for p.pos < len(p.input) && p.input[p.pos] != '\n' {
			p.pos++
		}
	}
}

func (p *luaParser) take(ch byte) bool {
	if p.pos < len(p.input) && p.input[p.pos] == ch {
		p.pos++
		return true
	}
	return false
}

func isIdentStart(ch byte) bool { return ch == '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' }
