package instancesearch

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// CELParseError is a syntax error in query text. Offset is the position of
// the offending token, counted in characters (runes) from the start.
type CELParseError struct {
	Offset  int
	Message string
}

func (e *CELParseError) Error() string {
	return fmt.Sprintf("%s (at character %d)", e.Message, e.Offset)
}

// ParseCEL parses the CEL-style text that FormatCEL and the frontend's
// formatCEL produce back into a search tree. It is a port of
// frontend/chronicle/src/pages/InstanceSearch/celParser.ts and covers the
// same dialect:
//
//	instance.name.contains("molten") && instance.clear_parse >= 95
//	players.exists(p, p.class == "DRUID" && p.sub_spec({"on": "trash"}) == "Bear")
//	players.filter(p, p.class == "PRIEST").size() >= 3
//	encounters.exists(e, e.name == "Ragnaros" && e.killed == true)
//	"unit-position" in instance.capabilities
//	!(x) , a || b , (a || b) && c , x in ["a", "b"] , timestamp("2026-10-01T00:00:00Z")
//
// It checks syntax only; Compile validates fields, operators and values.
// Empty text (or "true") means no conditions and returns nil. Errors are
// *CELParseError.
func ParseCEL(src string) (*Node, error) {
	if t := strings.TrimSpace(src); t == "" || t == "true" {
		return nil, nil
	}
	toks, err := celTokenize(src)
	if err != nil {
		return nil, err
	}
	p := &celParser{toks: toks}
	n, err := p.parse()
	if err != nil {
		return nil, err
	}
	return &n, nil
}

type celTokKind int

const (
	celIdent celTokKind = iota
	celString
	celNumber
	celPunct
	celEOF
)

type celTok struct {
	kind celTokKind
	str  string // ident name, string value or punctuation
	num  float64
	at   int
}

var celPunctuation = []string{"&&", "||", "==", "!=", "<=", ">=", "<", ">", "!", "(", ")", "[", "]", "{", "}", ",", ":", "."}

func isCELDigit(r rune) bool { return r >= '0' && r <= '9' }
func isCELIdentStart(r rune) bool {
	return r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func celTokenize(src string) ([]celTok, error) {
	rs := []rune(src)
	var toks []celTok
	i := 0
	for i < len(rs) {
		c := rs[i]
		switch {
		case unicode.IsSpace(c):
			i++
		case c == '"':
			// JSON string (formatCEL uses JSON.stringify).
			j := i + 1
			for j < len(rs) && rs[j] != '"' {
				if rs[j] == '\\' {
					j += 2
				} else {
					j++
				}
			}
			if j >= len(rs) {
				return nil, &CELParseError{Offset: i, Message: "Unterminated string"}
			}
			var s string
			if err := json.Unmarshal([]byte(string(rs[i:j+1])), &s); err != nil {
				return nil, &CELParseError{Offset: i, Message: "Invalid string"}
			}
			toks = append(toks, celTok{kind: celString, str: s, at: i})
			i = j + 1
		case isCELDigit(c) || (c == '-' && i+1 < len(rs) && isCELDigit(rs[i+1])):
			// -?\d+(\.\d+)?
			j := i + 1
			for j < len(rs) && isCELDigit(rs[j]) {
				j++
			}
			if j+1 < len(rs) && rs[j] == '.' && isCELDigit(rs[j+1]) {
				j++
				for j < len(rs) && isCELDigit(rs[j]) {
					j++
				}
			}
			f, err := strconv.ParseFloat(string(rs[i:j]), 64)
			if err != nil {
				return nil, &CELParseError{Offset: i, Message: "Invalid number"}
			}
			toks = append(toks, celTok{kind: celNumber, num: f, at: i})
			i = j
		case isCELIdentStart(c):
			j := i + 1
			for j < len(rs) && (isCELIdentStart(rs[j]) || isCELDigit(rs[j])) {
				j++
			}
			toks = append(toks, celTok{kind: celIdent, str: string(rs[i:j]), at: i})
			i = j
		default:
			p := ""
			rest := string(rs[i:min(i+2, len(rs))])
			for _, x := range celPunctuation {
				if strings.HasPrefix(rest, x) {
					p = x
					break
				}
			}
			if p == "" {
				return nil, &CELParseError{Offset: i, Message: fmt.Sprintf("Unexpected character %q", string(c))}
			}
			toks = append(toks, celTok{kind: celPunct, str: p, at: i})
			i += len(p)
		}
	}
	return append(toks, celTok{kind: celEOF, at: len(rs)}), nil
}

var celCompare = map[string]Op{"==": OpEq, "!=": OpNe, "<": OpLt, "<=": OpLte, ">": OpGt, ">=": OpGte}

// celObject is a {"key": value} literal with its keys in source order.
type celObject []celPair

type celPair struct {
	key   string
	value any
}

// celParser is a recursive-descent parser. Errors panic with *CELParseError
// and are recovered in parse, which keeps the grammar code close to the
// TypeScript original.
type celParser struct {
	toks []celTok
	i    int
}

func (p *celParser) peek(o int) celTok { return p.toks[min(p.i+o, len(p.toks)-1)] }
func (p *celParser) next() celTok {
	t := p.peek(0)
	if p.i < len(p.toks) {
		p.i++
	}
	return t
}

func (p *celParser) isPunct(v string, o int) bool {
	t := p.peek(o)
	return t.kind == celPunct && t.str == v
}

func (p *celParser) isIdent(v string, o int) bool {
	t := p.peek(o)
	return t.kind == celIdent && t.str == v
}

func (p *celParser) failAt(msg string, t celTok) {
	panic(&CELParseError{Offset: t.at, Message: msg})
}

func (p *celParser) fail(msg string) { p.failAt(msg, p.peek(0)) }

func (p *celParser) expectPunct(v string) {
	if !p.isPunct(v, 0) {
		p.fail(fmt.Sprintf("Expected %q", v))
	}
	p.i++
}

func (p *celParser) expectIdent(v string) string {
	t := p.peek(0)
	if t.kind != celIdent || (v != "" && t.str != v) {
		if v != "" {
			p.fail(fmt.Sprintf("Expected %q", v))
		}
		p.fail("Expected a name")
	}
	p.i++
	return t.str
}

func (p *celParser) parse() (n Node, err error) {
	defer func() {
		if r := recover(); r != nil {
			pe, ok := r.(*CELParseError)
			if !ok {
				panic(r)
			}
			err = pe
		}
	}()
	n = p.or(nil)
	if p.peek(0).kind != celEOF {
		p.fail("Unexpected text after the end of the query")
	}
	return n, nil
}

// scope maps a quantifier variable to its field prefix, e.g. p -> "player".
type celScope map[string]string

func (p *celParser) or(scope celScope) Node {
	parts := []Node{p.and(scope)}
	for p.isPunct("||", 0) {
		p.i++
		parts = append(parts, p.and(scope))
	}
	if len(parts) == 1 {
		return parts[0]
	}
	var out []Node
	for _, c := range parts {
		if c.Or != nil && c.And == nil {
			out = append(out, c.Or...)
		} else {
			out = append(out, c)
		}
	}
	return Node{Or: out}
}

func (p *celParser) and(scope celScope) Node {
	parts := []Node{p.unary(scope)}
	for p.isPunct("&&", 0) {
		p.i++
		parts = append(parts, p.unary(scope))
	}
	if len(parts) == 1 {
		return parts[0]
	}
	var out []Node
	for _, c := range parts {
		if c.And != nil && c.Or == nil {
			out = append(out, c.And...)
		} else {
			out = append(out, c)
		}
	}
	return Node{And: out}
}

func (p *celParser) isCapabilities() bool {
	return p.isIdent("instance", 0) && p.isPunct(".", 1) && p.isIdent("capabilities", 2)
}

func (p *celParser) unary(scope celScope) Node {
	if !p.isPunct("!", 0) {
		return p.primary(scope)
	}
	p.i++
	// !instance.capabilities.exists(c, c in [...]) -> capability not_in
	if p.isCapabilities() {
		n := p.primary(scope)
		if n.Op == OpIn {
			n.Op = OpNotIn
			return n
		}
		return Node{Not: &n}
	}
	inner := p.unary(scope)
	// !(x in [..]) -> not_in ; !("cap" in instance.capabilities) -> !=
	if _, isList := inner.Value.([]any); inner.Field != "" && inner.Op == OpIn && isList {
		inner.Op = OpNotIn
		return inner
	}
	if inner.Field == "instance.capability" && inner.Op == OpEq {
		inner.Op = OpNe
		return inner
	}
	return Node{Not: &inner}
}

func (p *celParser) primary(scope celScope) Node {
	t := p.peek(0)
	if p.isPunct("(", 0) {
		p.i++
		n := p.or(scope)
		p.expectPunct(")")
		return n
	}
	// "cap" in instance.capabilities
	if t.kind == celString {
		p.i++
		p.expectIdent("in")
		p.expectIdent("instance")
		p.expectPunct(".")
		p.expectIdent("capabilities")
		return Node{Field: "instance.capability", Op: OpEq, Value: t.str}
	}
	if t.kind == celIdent && (t.str == "players" || t.str == "encounters") && p.isPunct(".", 1) {
		return p.quantifier(scope)
	}
	if p.isCapabilities() {
		// instance.capabilities.exists(c, c in [...])
		p.i += 3
		p.expectPunct(".")
		p.expectIdent("exists")
		p.expectPunct("(")
		v := p.expectIdent("")
		p.expectPunct(",")
		if p.peek(0).kind != celIdent || p.peek(0).str != v {
			p.fail(fmt.Sprintf("Expected %q", v))
		}
		p.i++
		p.expectIdent("in")
		list := p.literal()
		p.expectPunct(")")
		return Node{Field: "instance.capability", Op: OpIn, Value: celValueOf(list)}
	}
	if t.kind == celIdent {
		return p.predicate(scope)
	}
	p.fail("Expected a condition")
	return Node{}
}

func (p *celParser) quantifier(scope celScope) Node {
	listTok := p.next()
	kind := "encounter"
	if listTok.str == "players" {
		kind = "player"
	}
	if len(scope) > 0 {
		p.failAt("players / encounters can only be used at the top level", listTok)
	}
	p.expectPunct(".")
	methodTok := p.peek(0)
	method := p.expectIdent("")
	wrapCount := func(c Count) Node {
		if kind == "player" {
			return Node{CountPlayers: &c}
		}
		return Node{CountEncounters: &c}
	}
	if method == "size" {
		p.expectPunct("(")
		p.expectPunct(")")
		return wrapCount(p.countTail())
	}
	if method != "exists" && method != "filter" {
		p.failAt(fmt.Sprintf("Unknown method %q (use exists, filter or size)", method), methodTok)
	}
	p.expectPunct("(")
	v := p.expectIdent("")
	p.expectPunct(",")
	inner := p.or(celScope{v: kind})
	p.expectPunct(")")
	if method == "exists" {
		if kind == "player" {
			return Node{AnyPlayer: &inner}
		}
		return Node{AnyEncounter: &inner}
	}
	p.expectPunct(".")
	p.expectIdent("size")
	p.expectPunct("(")
	p.expectPunct(")")
	c := p.countTail()
	c.Where = &inner
	return wrapCount(c)
}

func (p *celParser) countTail() Count {
	t := p.next()
	op, ok := celCompare[t.str]
	if t.kind != celPunct || !ok {
		p.failAt("Expected a comparison like >= 3", t)
	}
	n := p.next()
	if n.kind != celNumber {
		p.failAt("Expected a number", n)
	}
	if n.num != float64(int64(n.num)) {
		p.failAt("Expected a whole number", n)
	}
	return Count{Op: op, Value: int64(n.num)}
}

func (p *celParser) predicate(scope celScope) Node {
	first := p.next()
	var prefix string
	switch {
	case first.str == "instance":
		prefix = "instance"
	case scope[first.str] != "":
		prefix = scope[first.str]
	default:
		p.failAt(fmt.Sprintf("Unknown name %q (use instance.…, or a variable from players / encounters)", first.str), first)
	}
	p.expectPunct(".")
	node := Node{Field: prefix + "." + p.expectIdent("")}

	// Options: field({"bosses": [...], "match": "each"})
	if p.isPunct("(", 0) {
		p.i++
		at := p.peek(0)
		opts, ok := p.literal().(celObject)
		if !ok {
			p.failAt(`Expected options like {"bosses": [...]}`, at)
		}
		for _, kv := range opts {
			p.setOption(&node, kv, at)
		}
		p.expectPunct(")")
	}

	// .contains("x") / .startsWith("x") / .between(low, high)
	if p.isPunct(".", 0) {
		p.i++
		mTok := p.peek(0)
		m := p.expectIdent("")
		if m == "between" {
			p.expectPunct("(")
			low := p.literal()
			p.expectPunct(",")
			high := p.literal()
			p.expectPunct(")")
			node.Op = OpBetween
			node.Value = []any{celValueOf(low), celValueOf(high)}
			return node
		}
		switch m {
		case "contains":
			node.Op = OpContains
		case "startsWith":
			node.Op = OpStartsWith
		default:
			p.failAt(fmt.Sprintf("Unknown method %q (use contains, startsWith or between)", m), mTok)
		}
		p.expectPunct("(")
		node.Value = celValueOf(p.literal())
		p.expectPunct(")")
		return node
	}
	if p.isIdent("in", 0) {
		p.i++
		at := p.peek(0)
		v := p.literal()
		if _, ok := v.([]any); !ok {
			p.failAt("Expected a list after in", at)
		}
		node.Op = OpIn
		node.Value = celValueOf(v)
		return node
	}
	t := p.next()
	op, ok := celCompare[t.str]
	if t.kind != celPunct || !ok {
		p.failAt("Expected ==, !=, <, <=, >, >=, in, .contains(), .startsWith() or .between()", t)
	}
	node.Op = op
	node.Value = celValueOf(p.literal())
	return node
}

// setOption copies one {"key": value} option onto the predicate. Values are
// type-checked only as far as the Node's Go types require; Compile checks
// whether the field accepts them.
func (p *celParser) setOption(n *Node, kv celPair, at celTok) {
	str := func() string {
		s, ok := kv.value.(string)
		if !ok {
			p.failAt(fmt.Sprintf("Option %q must be a string", kv.key), at)
		}
		return s
	}
	switch kv.key {
	case "bosses":
		list, ok := kv.value.([]any)
		if !ok {
			p.failAt(`Option "bosses" must be a list of names`, at)
		}
		bosses := make([]string, len(list))
		for i, b := range list {
			s, ok := b.(string)
			if !ok {
				p.failAt(`Option "bosses" must be a list of names`, at)
			}
			bosses[i] = s
		}
		n.Bosses = bosses
	case "match":
		n.Match = Match(str())
	case "parse_scope":
		n.ParseScope = ParseScope(str())
	case "metric":
		n.Metric = Metric(str())
	case "on":
		n.On = On(str())
	default:
		p.failAt(fmt.Sprintf("Unknown option %q", kv.key), at)
	}
}

// literal reads a string, number, true/false, timestamp("..."), [list] or
// {"key": value}. Lists are []any and objects celObject.
func (p *celParser) literal() any {
	t := p.next()
	switch t.kind {
	case celString:
		return t.str
	case celNumber:
		return t.num
	case celIdent:
		switch t.str {
		case "true":
			return true
		case "false":
			return false
		case "timestamp":
			p.expectPunct("(")
			s := p.next()
			if s.kind != celString {
				p.failAt("Expected a date string", s)
			}
			p.expectPunct(")")
			return s.str
		}
	case celPunct:
		switch t.str {
		case "[":
			out := []any{}
			for !p.isPunct("]", 0) {
				out = append(out, p.literal())
				if !p.isPunct("]", 0) {
					p.expectPunct(",")
				}
			}
			p.i++
			return out
		case "{":
			out := celObject{}
			for !p.isPunct("}", 0) {
				k := p.next()
				if k.kind != celString {
					p.failAt("Expected a quoted option name", k)
				}
				p.expectPunct(":")
				out = append(out, celPair{key: k.str, value: p.literal()})
				if !p.isPunct("}", 0) {
					p.expectPunct(",")
				}
			}
			p.i++
			return out
		}
	}
	p.failAt("Expected a value", t)
	return nil
}

// celValueOf converts a literal to the plain JSON-like value a Node holds.
// Objects are not valid values; they become maps for Compile to reject.
func celValueOf(v any) any {
	switch x := v.(type) {
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = celValueOf(e)
		}
		return out
	case celObject:
		m := make(map[string]any, len(x))
		for _, kv := range x {
			m[kv.key] = celValueOf(kv.value)
		}
		return m
	}
	return v
}
