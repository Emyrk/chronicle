// Package luadata parses a restricted subset of Lua data without executing Lua.
package luadata

import (
	"context"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode"
)

type Kind uint8

const (
	Nil Kind = iota
	String
	Number
	Bool
	Table
)

// Value is literal syntax, not an evaluated Lua object. Text preserves number
// spelling and decoded string bytes. Fields holds string keys; NumericFields
// holds numeric keys using their source spelling, so [1] and ["1"] stay distinct.
// Array holds implicit entries in source order. Nil entries and false values
// are retained. No Lua table mutation is performed.
type Value struct {
	Kind          Kind
	Text          string
	Boolean       bool
	Fields        map[string]Value
	NumericFields map[string]Value
	Array         []Value
}

// Parser reads only literal data and assignments. It never resolves identifiers,
// evaluates expressions, invokes functions, or runs a Lua interpreter.
type Parser struct {
	ctx     context.Context
	input   string
	pos     int
	depth   int
	entries int
}

// Limits bound input, decoded strings (which cannot exceed input size), nesting,
// and total table entries. No interpreter, regex backtracking, or external I/O is used.
const (
	MaxInputBytes = 8 << 20
	MaxDepth      = 32
	MaxEntries    = 500000
)

// NewParser creates a resource-bounded data reader. Limits apply across all
// assignments read by this parser, not separately to each table.
func NewParser(ctx context.Context, input string) (*Parser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if len(input) > MaxInputBytes {
		return nil, fmt.Errorf("lua input exceeds %d bytes", MaxInputBytes)
	}
	return &Parser{ctx: ctx, input: input}, nil
}

// ParseTable reads exactly one table expression, allowing comments and whitespace
// but rejecting assignments, trailing data, and executable expressions.
func ParseTable(ctx context.Context, input string) (Value, error) {
	p, err := NewParser(ctx, input)
	if err != nil {
		return Value{}, err
	}
	value, err := p.value()
	if err != nil {
		return Value{}, err
	}
	if value.Kind != Table {
		return Value{}, fmt.Errorf("expected a Lua table")
	}
	if err := p.space(); err != nil {
		return Value{}, err
	}
	if p.pos != len(input) {
		return Value{}, fmt.Errorf("trailing Lua data at byte %d", p.pos)
	}
	return value, nil
}

// NextAssignment reads a single name = literal assignment, or returns io.EOF.
// Callers that require the entire file must continue reading until io.EOF.
func (p *Parser) NextAssignment() (string, Value, error) {
	if err := p.space(); err != nil {
		return "", Value{}, err
	}
	if p.take(';') {
		if err := p.space(); err != nil {
			return "", Value{}, err
		}
	}
	if p.pos == len(p.input) {
		return "", Value{}, io.EOF
	}
	name, err := p.identifier()
	if err != nil {
		return "", Value{}, fmt.Errorf("saved variables assignment: %w", err)
	}
	if err := p.space(); err != nil {
		return "", Value{}, err
	}
	if !p.take('=') {
		return "", Value{}, fmt.Errorf("saved variables assignment %q: expected =", name)
	}
	value, err := p.value()
	if err != nil {
		return "", Value{}, fmt.Errorf("saved variables assignment %q: %w", name, err)
	}
	return name, value, nil
}

func (p *Parser) value() (Value, error) {
	if err := p.space(); err != nil {
		return Value{}, err
	}
	if p.pos >= len(p.input) {
		return Value{}, fmt.Errorf("unexpected end of input")
	}
	switch p.input[p.pos] {
	case '{':
		return p.table()
	case '\'', '"':
		s, err := p.quotedString()
		return Value{Kind: String, Text: s}, err
	}
	if isIdentStart(p.input[p.pos]) {
		word, err := p.identifier()
		if err != nil {
			return Value{}, err
		}
		switch word {
		case "true":
			return Value{Kind: Bool, Boolean: true}, nil
		case "false":
			return Value{Kind: Bool}, nil
		case "nil":
			return Value{Kind: Nil}, nil
		default:
			return Value{}, fmt.Errorf("unsupported identifier value %q", word)
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
			return Value{}, fmt.Errorf("invalid number at byte %d", start)
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
				return Value{}, fmt.Errorf("invalid number exponent at byte %d", start)
			}
		}
		return Value{Kind: Number, Text: p.input[start:p.pos]}, nil
	}
	return Value{}, fmt.Errorf("unsupported value at byte %d", p.pos)
}

func (p *Parser) table() (Value, error) {
	p.depth++
	defer func() { p.depth-- }()
	if p.depth > MaxDepth {
		return Value{}, fmt.Errorf("table nesting exceeds 32")
	}
	p.pos++
	result := Value{Kind: Table, Fields: make(map[string]Value), NumericFields: make(map[string]Value)}
	for {
		if err := p.space(); err != nil {
			return Value{}, err
		}
		if p.take('}') {
			return result, nil
		}
		p.entries++
		if p.entries > MaxEntries {
			return Value{}, fmt.Errorf("table entry limit exceeded")
		}

		var key string
		numericKey := false
		keyed := false
		bracketKey := false
		if p.take('[') {
			bracketKey = true
			keyValue, err := p.value()
			if err != nil {
				return Value{}, fmt.Errorf("table key: %w", err)
			}
			if err := p.space(); err != nil {
				return Value{}, err
			}
			if !p.take(']') {
				return Value{}, fmt.Errorf("table key: expected ]")
			}
			if keyValue.Kind == String || keyValue.Kind == Number {
				key = keyValue.Text
				numericKey = keyValue.Kind == Number
			} else {
				return Value{}, fmt.Errorf("table key must be string or number")
			}
			keyed = true
		} else if p.pos < len(p.input) && isIdentStart(p.input[p.pos]) {
			saved := p.pos
			identifier, err := p.identifier()
			if err != nil {
				return Value{}, err
			}
			if err := p.space(); err != nil {
				return Value{}, err
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
					return Value{}, err
				}
				if !p.take('=') {
					return Value{}, fmt.Errorf("table field %q: expected =", key)
				}
			}
			value, err := p.value()
			if err != nil {
				return Value{}, fmt.Errorf("table field %q: %w", key, err)
			}
			fields := result.Fields
			if numericKey {
				fields = result.NumericFields
			}
			if _, exists := fields[key]; exists {
				return Value{}, fmt.Errorf("duplicate table field %q", key)
			}
			fields[key] = value
		} else {
			value, err := p.value()
			if err != nil {
				return Value{}, err
			}
			result.Array = append(result.Array, value)
		}
		if err := p.space(); err != nil {
			return Value{}, err
		}
		if p.take(',') || p.take(';') {
			continue
		}
		if p.pos >= len(p.input) || p.input[p.pos] != '}' {
			return Value{}, fmt.Errorf("table: expected separator or }")
		}
	}
}

func (p *Parser) identifier() (string, error) {
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

func (p *Parser) quotedString() (string, error) {
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
			value, err := strconv.ParseUint(string(digits), 10, 8)
			if err != nil {
				return "", fmt.Errorf("decimal string escape exceeds 255")
			}
			result.WriteByte(byte(value))
		}
	}
	return "", fmt.Errorf("unterminated quoted string")
}

func (p *Parser) space() error {
	if err := p.ctx.Err(); err != nil {
		return err
	}
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

func (p *Parser) take(ch byte) bool {
	if p.pos < len(p.input) && p.input[p.pos] == ch {
		p.pos++
		return true
	}
	return false
}

func isIdentStart(ch byte) bool { return ch == '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' }
