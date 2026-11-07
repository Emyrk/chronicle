// Package stategraph describes typed state as a path tree with references and
// dependency edges.
//
// Path containment is navigation structure, not an ownership declaration.
// Directory and value nodes may both contain child paths. Semantic ownership
// validation is deferred until snapshot codecs declare which children they own.
package stategraph

import (
	"encoding/json"
	"fmt"
	"path"
	"slices"
	"strings"
)

// Path is an absolute, normalized path in a state graph.
type Path string

// Kind identifies how a node participates in the graph.
type Kind string

const (
	KindDirectory Kind = "directory"
	KindValue     Kind = "value"
	KindReference Kind = "reference"
)

// Node is one entry in the path tree. Directory and value nodes may contain
// child paths. Reference nodes use Type as their expected target type and may
// not contain children.
type Node struct {
	Path     Path            `json:"path"`
	Kind     Kind            `json:"kind"`
	Type     string          `json:"type,omitempty"`
	Target   Path            `json:"target,omitempty"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

// Dependency records that From depends on To. Dependencies are separate from
// references because not every dependency is a shared runtime object.
type Dependency struct {
	From Path `json:"from"`
	To   Path `json:"to"`
}

// FormatVersion is the current JSON graph format.
const FormatVersion = 1

// Graph is the JSON representation consumed by future catalog and explorer
// tooling.
type Graph struct {
	Version      int          `json:"version"`
	Root         Path         `json:"root"`
	Nodes        []Node       `json:"nodes"`
	Dependencies []Dependency `json:"dependencies,omitempty"`
}

// Find returns the node at p.
func (g Graph) Find(p Path) (Node, bool) {
	for _, node := range g.Nodes {
		if node.Path == p {
			return node, true
		}
	}
	return Node{}, false
}

// Children returns the immediate children of p in deterministic path order.
func (g Graph) Children(p Path) []Node {
	children := make([]Node, 0)
	for _, node := range g.Nodes {
		if node.Path != p && Path(path.Dir(string(node.Path))) == p {
			children = append(children, node)
		}
	}
	return children
}

// ReferencesTo returns references whose canonical target is p.
func (g Graph) ReferencesTo(p Path) []Node {
	references := make([]Node, 0)
	for _, node := range g.Nodes {
		if node.Kind == KindReference && node.Target == p {
			references = append(references, node)
		}
	}
	return references
}

// DependenciesFrom returns dependency edges originating at p.
func (g Graph) DependenciesFrom(p Path) []Dependency {
	dependencies := make([]Dependency, 0)
	for _, dependency := range g.Dependencies {
		if dependency.From == p {
			dependencies = append(dependencies, dependency)
		}
	}
	return dependencies
}

// Registry builds and validates a Graph.
type Registry struct {
	root         Path
	nodes        map[Path]Node
	dependencies map[Dependency]struct{}
}

// New creates an empty registry rooted at root.
func New(root string) (*Registry, error) {
	p, err := normalizedPath(root)
	if err != nil {
		return nil, err
	}
	return &Registry{
		root:         p,
		nodes:        make(map[Path]Node),
		dependencies: make(map[Dependency]struct{}),
	}, nil
}

// Directory registers a structural path.
func (r *Registry) Directory(p string, metadata json.RawMessage) error {
	return r.add(Node{Path: Path(p), Kind: KindDirectory, Metadata: metadata})
}

// Value registers a canonical typed value.
func (r *Registry) Value(p, typ string, metadata json.RawMessage) error {
	return r.add(Node{Path: Path(p), Kind: KindValue, Type: typ, Metadata: metadata})
}

// Reference registers a typed alias to a canonical value.
func (r *Registry) Reference(p, target, expectedType string, metadata json.RawMessage) error {
	return r.add(Node{
		Path:     Path(p),
		Kind:     KindReference,
		Type:     expectedType,
		Target:   Path(target),
		Metadata: metadata,
	})
}

// DependsOn records a dependency edge between existing or future nodes.
func (r *Registry) DependsOn(from, to string) error {
	fromPath, err := normalizedPath(from)
	if err != nil {
		return err
	}
	toPath, err := normalizedPath(to)
	if err != nil {
		return err
	}
	dep := Dependency{From: fromPath, To: toPath}
	if _, ok := r.dependencies[dep]; ok {
		return fmt.Errorf("duplicate dependency %q -> %q", fromPath, toPath)
	}
	r.dependencies[dep] = struct{}{}
	return nil
}

func (r *Registry) add(node Node) error {
	p, err := normalizedPath(string(node.Path))
	if err != nil {
		return err
	}
	node.Path = p
	if _, ok := r.nodes[p]; ok {
		return fmt.Errorf("state graph path %q is already registered", p)
	}
	r.nodes[p] = node
	return nil
}

// Graph validates the registry and returns a deterministically ordered graph.
func (r *Registry) Graph() (Graph, error) {
	if err := r.validate(); err != nil {
		return Graph{}, err
	}

	nodes := make([]Node, 0, len(r.nodes))
	for _, node := range r.nodes {
		nodes = append(nodes, node)
	}
	slices.SortFunc(nodes, func(a, b Node) int {
		return strings.Compare(string(a.Path), string(b.Path))
	})

	dependencies := make([]Dependency, 0, len(r.dependencies))
	for dependency := range r.dependencies {
		dependencies = append(dependencies, dependency)
	}
	slices.SortFunc(dependencies, func(a, b Dependency) int {
		if cmp := strings.Compare(string(a.From), string(b.From)); cmp != 0 {
			return cmp
		}
		return strings.Compare(string(a.To), string(b.To))
	})

	return Graph{Version: FormatVersion, Root: r.root, Nodes: nodes, Dependencies: dependencies}, nil
}

func (r *Registry) validate() error {
	root, ok := r.nodes[r.root]
	if !ok {
		return fmt.Errorf("state graph root %q is not registered", r.root)
	}
	if root.Kind != KindDirectory {
		return fmt.Errorf("state graph root %q must be a directory", r.root)
	}

	for p, node := range r.nodes {
		if p != r.root {
			parent := Path(path.Dir(string(p)))
			parentNode, ok := r.nodes[parent]
			if !ok {
				return fmt.Errorf("state graph path %q has missing parent %q", p, parent)
			}
			if parentNode.Kind == KindReference {
				return fmt.Errorf("reference %q cannot have child %q", parent, p)
			}
		}

		switch node.Kind {
		case KindDirectory:
			if node.Type != "" || node.Target != "" {
				return fmt.Errorf("directory %q cannot have type or target", p)
			}
		case KindValue:
			if node.Type == "" {
				return fmt.Errorf("value %q requires a type", p)
			}
			if node.Target != "" {
				return fmt.Errorf("value %q cannot have a target", p)
			}
		case KindReference:
			if node.Type == "" || node.Target == "" {
				return fmt.Errorf("reference %q requires an expected type and target", p)
			}
			target, err := normalizedPath(string(node.Target))
			if err != nil {
				return fmt.Errorf("reference %q target: %w", p, err)
			}
			targetNode, ok := r.nodes[target]
			if !ok {
				return fmt.Errorf("reference %q has missing target %q", p, target)
			}
			if targetNode.Kind != KindValue {
				return fmt.Errorf("reference %q target %q must be a value", p, target)
			}
			if targetNode.Type != node.Type {
				return fmt.Errorf("reference %q expects type %q, target %q has type %q", p, node.Type, target, targetNode.Type)
			}
		default:
			return fmt.Errorf("state graph path %q has unknown kind %q", p, node.Kind)
		}
	}

	adjacency := make(map[Path][]Path)
	for dependency := range r.dependencies {
		if _, ok := r.nodes[dependency.From]; !ok {
			return fmt.Errorf("dependency source %q is not registered", dependency.From)
		}
		if _, ok := r.nodes[dependency.To]; !ok {
			return fmt.Errorf("dependency target %q is not registered", dependency.To)
		}
		if dependency.From == dependency.To {
			return fmt.Errorf("dependency %q cannot target itself", dependency.From)
		}
		adjacency[dependency.From] = append(adjacency[dependency.From], dependency.To)
	}
	if cycle := dependencyCycle(adjacency); len(cycle) > 0 {
		return fmt.Errorf("dependency cycle: %s", strings.Join(pathsToStrings(cycle), " -> "))
	}
	return nil
}

func normalizedPath(raw string) (Path, error) {
	if raw == "" || !strings.HasPrefix(raw, "/") {
		return "", fmt.Errorf("state graph path %q must be absolute", raw)
	}
	clean := path.Clean(raw)
	if clean != raw {
		return "", fmt.Errorf("state graph path %q is not normalized; use %q", raw, clean)
	}
	return Path(clean), nil
}

func dependencyCycle(adjacency map[Path][]Path) []Path {
	const (
		unvisited = iota
		visiting
		visited
	)
	state := make(map[Path]int)
	stack := make([]Path, 0)
	var cycle []Path

	var visit func(Path) bool
	visit = func(node Path) bool {
		state[node] = visiting
		stack = append(stack, node)
		for _, next := range adjacency[node] {
			switch state[next] {
			case unvisited:
				if visit(next) {
					return true
				}
			case visiting:
				start := slices.Index(stack, next)
				cycle = append(cycle, stack[start:]...)
				cycle = append(cycle, next)
				return true
			}
		}
		stack = stack[:len(stack)-1]
		state[node] = visited
		return false
	}

	for node := range adjacency {
		if state[node] == unvisited && visit(node) {
			return cycle
		}
	}
	return nil
}

func pathsToStrings(paths []Path) []string {
	result := make([]string, len(paths))
	for i, p := range paths {
		result[i] = string(p)
	}
	return result
}
