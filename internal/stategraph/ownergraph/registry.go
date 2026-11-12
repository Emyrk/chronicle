// Package ownergraph composes explicitly registered owner-local codecs. It does
// not discover fields, infer ownership, serialize callbacks, or replay factories.
package ownergraph

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"

	"github.com/Emyrk/chronicle/internal/stategraph"
)

type Codec[T any] struct {
	Type     string
	Version  uint32
	Init     func() *T
	Capture  func(*T, *Capture) ([]byte, error)
	Restore  func(*T, uint32, []byte, *Restore) error
	Validate func(*T) error
}
type adapter struct {
	typ      string
	version  uint32
	init     func() any
	capture  func(any, *Capture) ([]byte, error)
	restore  func(any, uint32, []byte, *Restore) error
	validate func(any) error
}
type Registry struct {
	byType   map[string]*adapter
	byGoType map[reflect.Type]*adapter
}

func NewRegistry() *Registry {
	return &Registry{byType: map[string]*adapter{}, byGoType: map[reflect.Type]*adapter{}}
}

// Register binds a concrete pointer type explicitly. Reflection is used only as
// an identity/type key, never to inspect or serialize an owner's fields.
func Register[T any](r *Registry, c Codec[T]) error {
	if r == nil || c.Type == "" || c.Version == 0 || c.Init == nil || c.Capture == nil || c.Restore == nil {
		return fmt.Errorf("incomplete owner codec")
	}
	goType := reflect.TypeFor[*T]()
	if r.byType[c.Type] != nil || r.byGoType[goType] != nil {
		return fmt.Errorf("duplicate owner codec %s", c.Type)
	}
	a := &adapter{typ: c.Type, version: c.Version, init: func() any { return c.Init() }, capture: func(v any, ctx *Capture) ([]byte, error) { return c.Capture(v.(*T), ctx) }, restore: func(v any, version uint32, data []byte, ctx *Restore) error {
		return c.Restore(v.(*T), version, data, ctx)
	}, validate: func(v any) error {
		if c.Validate != nil {
			return c.Validate(v.(*T))
		}
		return nil
	}}
	r.byType[c.Type] = a
	r.byGoType[goType] = a
	return nil
}

type value struct {
	Version uint32          `json:"version"`
	Data    json.RawMessage `json:"data"`
}
type Snapshot struct {
	Graph stategraph.Graph `json:"graph"`
	Root  string           `json:"root"`
}
type captureRun struct {
	registry *Registry
	graph    *stategraph.Registry
	paths    map[any]string
	queue    []any
}
type Capture struct {
	run  *captureRun
	path string
	refs int
}

func validPointer(v any) bool {
	rv := reflect.ValueOf(v)
	return rv.IsValid() && rv.Kind() == reflect.Pointer && !rv.IsNil()
}
func (r *captureRun) intern(v any) (string, *adapter, error) {
	if !validPointer(v) {
		return "", nil, fmt.Errorf("owner must be a nonnil pointer")
	}
	a := r.registry.byGoType[reflect.TypeOf(v)]
	if a == nil {
		return "", nil, fmt.Errorf("unsupported owner %T", v)
	}
	if p, ok := r.paths[v]; ok {
		return p, a, nil
	}
	p := fmt.Sprintf("/owners/%08d", len(r.queue))
	r.paths[v] = p
	r.queue = append(r.queue, v)
	return p, a, nil
}

// Ref declares one referencing-owner edge and interns the canonical target.
func (c *Capture) Ref(owner any) (string, error) {
	p, a, e := c.run.intern(owner)
	if e != nil {
		return "", e
	}
	edge := fmt.Sprintf("%s/ref%08d", c.path, c.refs)
	c.refs++
	if e := c.run.graph.Reference(edge, p, a.typ, nil); e != nil {
		return "", e
	}
	return p, nil
}
func (r *Registry) Capture(root any) (Snapshot, error) {
	graph, e := stategraph.New("/owners")
	if e != nil {
		return Snapshot{}, e
	}
	if e = graph.Directory("/owners", nil); e != nil {
		return Snapshot{}, e
	}
	run := &captureRun{registry: r, graph: graph, paths: map[any]string{}}
	path, _, e := run.intern(root)
	if e != nil {
		return Snapshot{}, e
	}
	for i := 0; i < len(run.queue); i++ {
		owner := run.queue[i]
		a := r.byGoType[reflect.TypeOf(owner)]
		p := run.paths[owner]
		data, e := a.capture(owner, &Capture{run: run, path: p})
		if e != nil {
			return Snapshot{}, fmt.Errorf("capture %s: %w", a.typ, e)
		}
		if !json.Valid(data) {
			return Snapshot{}, fmt.Errorf("invalid owner payload %s", a.typ)
		}
		metadata, e := json.Marshal(value{a.version, data})
		if e != nil {
			return Snapshot{}, e
		}
		if e = graph.Value(p, a.typ, metadata); e != nil {
			return Snapshot{}, e
		}
	}
	g, e := graph.Graph()
	if e != nil {
		return Snapshot{}, e
	}
	return Snapshot{g, path}, nil
}

type restoreRun struct {
	registry *Registry
	objects  map[string]any
	nodes    map[string]stategraph.Node
	values   map[string]value
	status   map[string]uint8
	edges    map[string]map[string]bool
}
type Restore struct {
	run  *restoreRun
	path string
}

// Resolve returns an initialized canonical object without loading it, supporting
// cycles. Load additionally requires the target's state before the caller loads
// its own state (e.g. Common validates its already-loaded Base).
func (c *Restore) Resolve(path string) (any, error) {
	if !c.run.edges[c.path][path] {
		return nil, fmt.Errorf("undeclared reference %s -> %s", c.path, path)
	}
	v, ok := c.run.objects[path]
	if !ok {
		return nil, fmt.Errorf("missing owner %s", path)
	}
	return v, nil
}
func (c *Restore) Load(path string) (any, error) {
	v, e := c.Resolve(path)
	if e != nil {
		return nil, e
	}
	if e = c.run.load(path); e != nil {
		return nil, e
	}
	return v, nil
}
func (r *restoreRun) load(path string) error {
	if r.status[path] == 2 {
		return nil
	}
	if r.status[path] == 1 {
		return fmt.Errorf("cyclic required-load dependency at %s", path)
	}
	r.status[path] = 1
	n := r.nodes[path]
	v := r.values[path]
	a := r.registry.byType[n.Type]
	if e := a.restore(r.objects[path], v.Version, v.Data, &Restore{run: r, path: path}); e != nil {
		return fmt.Errorf("restore %s: %w", n.Type, e)
	}
	r.status[path] = 2
	return nil
}
func (r *Registry) Restore(s Snapshot) (any, error) {
	// Rebuild structural validation rather than trusting a decoded graph.
	if s.Graph.Version != stategraph.FormatVersion || s.Graph.Root != "/owners" {
		return nil, fmt.Errorf("unsupported owner graph")
	}
	g, e := stategraph.New("/owners")
	if e != nil {
		return nil, e
	}
	run := &restoreRun{registry: r, objects: map[string]any{}, nodes: map[string]stategraph.Node{}, values: map[string]value{}, status: map[string]uint8{}, edges: map[string]map[string]bool{}}
	for _, n := range s.Graph.Nodes {
		p := string(n.Path)
		switch n.Kind {
		case stategraph.KindDirectory:
			e = g.Directory(p, n.Metadata)
		case stategraph.KindReference:
			e = g.Reference(p, string(n.Target), n.Type, n.Metadata)
		case stategraph.KindValue:
			a := r.byType[n.Type]
			if a == nil {
				return nil, fmt.Errorf("unsupported owner type %s", n.Type)
			}
			var v value
			if e = json.Unmarshal(n.Metadata, &v); e != nil {
				return nil, e
			}
			if v.Version != a.version || !json.Valid(v.Data) {
				return nil, fmt.Errorf("unsupported owner version/payload %s", n.Type)
			}
			run.nodes[p] = n
			run.values[p] = v
			e = g.Value(p, n.Type, n.Metadata)
		default:
			return nil, fmt.Errorf("unsupported graph node kind")
		}
		if e != nil {
			return nil, e
		}
	}
	for _, dep := range s.Graph.Dependencies {
		if e = g.DependsOn(string(dep.From), string(dep.To)); e != nil {
			return nil, e
		}
	}
	if _, e = g.Graph(); e != nil {
		return nil, e
	}
	if _, ok := run.nodes[s.Root]; !ok {
		return nil, fmt.Errorf("missing root owner")
	}
	for _, n := range s.Graph.Nodes {
		if n.Kind != stategraph.KindReference {
			continue
		}
		p := string(n.Path)
		idx := len(p) - 1
		for idx >= 0 && p[idx] != '/' {
			idx--
		}
		owner := p[:idx]
		if _, ok := run.nodes[owner]; !ok {
			return nil, fmt.Errorf("reference not declared by owner")
		}
		if run.edges[owner] == nil {
			run.edges[owner] = map[string]bool{}
		}
		run.edges[owner][string(n.Target)] = true
	}
	paths := make([]string, 0, len(run.nodes))
	for p := range run.nodes {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	// Allocate every owner before any loader can resolve a cyclic reference.
	for _, p := range paths {
		a := r.byType[run.nodes[p].Type]
		v := a.init()
		if !validPointer(v) {
			return nil, fmt.Errorf("nil owner init %s", a.typ)
		}
		run.objects[p] = v
	}
	for _, p := range paths {
		if e = run.load(p); e != nil {
			return nil, e
		}
	}
	for _, p := range paths {
		if e = r.byType[run.nodes[p].Type].validate(run.objects[p]); e != nil {
			return nil, e
		}
	}
	return run.objects[s.Root], nil
}

// Reference adapts a typed referencing field to the canonical capture context.
func Reference[T any](c *Capture) func(T) (string, error) {
	return func(v T) (string, error) { return c.Ref(v) }
}
func ResolveAs[T any](c *Restore, path string) (T, error) {
	var zero T
	v, e := c.Resolve(path)
	if e != nil {
		return zero, e
	}
	typed, ok := v.(T)
	if !ok {
		return zero, fmt.Errorf("owner reference type mismatch at %s", path)
	}
	return typed, nil
}
func LoadAs[T any](c *Restore, path string) (T, error) {
	var zero T
	v, e := c.Load(path)
	if e != nil {
		return zero, e
	}
	typed, ok := v.(T)
	if !ok {
		return zero, fmt.Errorf("owner reference type mismatch at %s", path)
	}
	return typed, nil
}
func Resolver[T any](c *Restore) func(string) (T, error) {
	return func(path string) (T, error) { return ResolveAs[T](c, path) }
}
func Loader[T any](c *Restore) func(string) (T, error) {
	return func(path string) (T, error) { return LoadAs[T](c, path) }
}
