package modern

import next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"

type GUIDMapping = next.GUIDMapping
type guidNormalizer struct{ *next.GUIDNormalizer }

func newGUIDNormalizer() *guidNormalizer                       { return &guidNormalizer{next.NewGUIDNormalizer()} }
func (n *guidNormalizer) normalize(raw string) (string, error) { return n.Normalize(raw) }
func (n *guidNormalizer) mappings() []GUIDMapping              { return n.Mappings() }
func hash24(raw string) uint32                                 { return next.CompatibilityHash24(raw) }
