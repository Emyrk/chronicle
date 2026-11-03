package instancesearch

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// FormatCEL renders a search tree as CEL-style text, e.g.
//
//	instance.name == "Molten Core"
//	&& players.filter(p, p.class == "PRIEST").size() >= 3
//	&& players.exists(p, p.sub_spec == "Bear" && p.sub_spec == "Cat")
//
// It is for display only (docs, UI previews). There is no CEL parser yet:
// the JSON tree is the canonical format. Predicates with options render as a
// call with a map argument: p.parse({"bosses": ["Ragnaros"]}) >= 95.
// The tree should be valid (see Compile); invalid nodes render as "<invalid>".
func FormatCEL(n *Node) string {
	if n == nil {
		return "true"
	}
	// Break the top-level and/or across lines for readability.
	switch {
	case n.And != nil:
		return joinCEL(n.And, "\n&& ", "", n)
	case n.Or != nil:
		return joinCEL(n.Or, "\n|| ", "", n)
	}
	return celNode(n, "")
}

func joinCEL(children []Node, sep, v string, parent *Node) string {
	parts := make([]string, len(children))
	for i := range children {
		c := &children[i]
		s := celNode(c, v)
		// Parenthesize a nested and/or that differs from the parent.
		if (c.And != nil && parent.Or != nil) || (c.Or != nil && parent.And != nil) {
			s = "(" + s + ")"
		}
		parts[i] = s
	}
	return strings.Join(parts, sep)
}

// celNode renders n. v is the quantifier variable in scope ("p" or "e").
func celNode(n *Node, v string) string {
	switch {
	case n.And != nil:
		return joinCEL(n.And, " && ", v, n)
	case n.Or != nil:
		return joinCEL(n.Or, " || ", v, n)
	case n.Not != nil:
		return "!(" + celNode(n.Not, v) + ")"
	case n.AnyPlayer != nil:
		return fmt.Sprintf("players.exists(p, %s)", celNode(n.AnyPlayer, "p"))
	case n.AnyEncounter != nil:
		return fmt.Sprintf("encounters.exists(e, %s)", celNode(n.AnyEncounter, "e"))
	case n.CountPlayers != nil:
		return celCount("players", "p", n.CountPlayers)
	case n.CountEncounters != nil:
		return celCount("encounters", "e", n.CountEncounters)
	case n.Field != "":
		return celPredicate(n, v)
	}
	return "<invalid>"
}

func celCount(list, v string, c *Count) string {
	op := celOp(c.Op)
	if c.Where == nil {
		return fmt.Sprintf("%s.size() %s %d", list, op, c.Value)
	}
	return fmt.Sprintf("%s.filter(%s, %s).size() %s %d", list, v, celNode(c.Where, v), op, c.Value)
}

func celPredicate(n *Node, v string) string {
	f, ok := fieldsByName[n.Field]
	if !ok {
		return "<invalid>"
	}
	value := celValue(f, n.Value)

	// Capabilities are a set on the instance.
	if f.Name == "instance.capability" {
		switch n.Op {
		case OpIn:
			return fmt.Sprintf("instance.capabilities.exists(c, c in %s)", value)
		case OpNotIn:
			return fmt.Sprintf("!instance.capabilities.exists(c, c in %s)", value)
		case OpNe:
			return fmt.Sprintf("!(%s in instance.capabilities)", value)
		default:
			return fmt.Sprintf("%s in instance.capabilities", value)
		}
	}

	name := f.Name
	if v != "" {
		// player.class -> p.class, encounter.name -> e.name
		name = v + name[strings.Index(name, "."):]
	}
	if opts := celOptions(f, n); opts != "" {
		name += "(" + opts + ")"
	}

	switch n.Op {
	case OpIn:
		return fmt.Sprintf("%s in %s", name, value)
	case OpNotIn:
		return fmt.Sprintf("!(%s in %s)", name, value)
	case OpContains:
		return fmt.Sprintf("%s.contains(%s)", name, value)
	case OpStartsWith:
		return fmt.Sprintf("%s.startsWith(%s)", name, value)
	default:
		return fmt.Sprintf("%s %s %s", name, celOp(n.Op), value)
	}
}

func celOptions(f *field, n *Node) string {
	var opts []string
	if f.Bosses && len(n.Bosses) > 0 {
		quoted := make([]string, len(n.Bosses))
		for i, b := range n.Bosses {
			quoted[i] = strconv.Quote(b)
		}
		opts = append(opts, `"bosses": [`+strings.Join(quoted, ", ")+`]`)
	}
	if f.Bosses && n.Match == MatchEach {
		opts = append(opts, `"match": "each"`)
	}
	if f.ParseScope && n.ParseScope != "" {
		opts = append(opts, `"parse_scope": `+strconv.Quote(string(n.ParseScope)))
	}
	if f.On && n.On != "" {
		opts = append(opts, `"on": `+strconv.Quote(string(n.On)))
	}
	if f.Metric && n.Metric != "" {
		opts = append(opts, `"metric": `+strconv.Quote(string(n.Metric)))
	}
	if len(opts) == 0 {
		return ""
	}
	return "{" + strings.Join(opts, ", ") + "}"
}

func celValue(f *field, value any) string {
	// Round-trip so json.RawMessage and decoded values render the same.
	raw, err := json.Marshal(value)
	if err != nil {
		return "<invalid>"
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return "<invalid>"
	}
	return celLiteral(f, v)
}

func celLiteral(f *field, v any) string {
	switch x := v.(type) {
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			parts[i] = celLiteral(f, e)
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case string:
		if f.Type == typeTime {
			return "timestamp(" + strconv.Quote(x) + ")"
		}
		return strconv.Quote(x)
	case bool:
		return strconv.FormatBool(x)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	return "<invalid>"
}

func celOp(op Op) string {
	if op == OpEq {
		return "=="
	}
	return string(op)
}
