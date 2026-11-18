package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

type shadowSource struct {
	entry uint32
	// nil preserves the legacy entry-only matching used by VanillaPlus.
	matches func(guid.GUID) bool
}

type shadowBossOptions struct {
	// A scoped processor forgets observations at zone/log/encounter boundaries.
	zone            func(zone.Zone) bool
	bossMatches     func(guid.GUID) bool
	observeAffected bool
	casts           bool
	ignoreActivity  string
}

type shadowMapping struct {
	boss    uint32
	sources []shadowSource
}

type shadowBosses struct {
	options  shadowBossOptions
	mappings []shadowMapping
	bosses   map[uint32]guid.GUID
	location zoner.Location
	enabled  bool
}

func newShadowBosses(options shadowBossOptions) *shadowBosses {
	return &shadowBosses{options: options, bosses: make(map[uint32]guid.GUID), enabled: options.zone == nil}
}

func (s *shadowBosses) shadowed(boss uint32, _ string, sources ...shadowSource) *shadowBosses {
	s.mappings = append(s.mappings, shadowMapping{boss: boss, sources: sources})
	s.bosses[boss] = 0
	return s
}

func (s *shadowBosses) reset() {
	for entry := range s.bosses {
		s.bosses[entry] = 0
	}
}

func (s *shadowBosses) observe(id guid.GUID) {
	entry, ok := id.GetEntry()
	if !ok || (s.options.bossMatches != nil && !s.options.bossMatches(id)) {
		return
	}
	if _, registered := s.bosses[entry]; registered {
		s.bosses[entry] = id
	}
}

// ProcessMessages rewrites only sources with an actually observed boss GUID.
// nolint: staticcheck // Cast is still emitted by older vanilla log formats.
func (s *shadowBosses) ProcessMessages(msgs []messages.Message) {
	for _, msg := range msgs {
		if s.options.zone != nil {
			switch m := msg.(type) {
			case *messages.Zone:
				if s.location.Process(*m) != zone.NoChange {
					s.reset()
				}
				s.enabled = s.options.zone(s.location.Zone)
			case *messages.Realm, *messages.Versions:
				s.reset()
				s.enabled = false
				s.location = zoner.Location{}
			case *messages.EncounterBoundary:
				s.reset()
			case *messages.UnitEvade:
				for entry, id := range s.bosses {
					if id == m.UnitGUID {
						s.bosses[entry] = 0
					}
				}
			}
		}
		if !s.enabled {
			continue
		}
		if s.options.observeAffected {
			if _, evaded := msg.(*messages.UnitEvade); !evaded {
				for _, id := range msg.Affects() {
					s.observe(id)
				}
			}
		} else if unit, ok := msg.(*messages.Unit); ok {
			s.observe(unit.Guid)
		}

		var caster *guid.GUID
		var base *messages.MessageBase
		switch m := msg.(type) {
		case *messages.Damage:
			caster, base = m.Caster, &m.MessageBase
		case *messages.SpellGo:
			if s.options.casts {
				caster, base = &m.Caster, &m.MessageBase
			}
		case *messages.SpellStart:
			if s.options.casts {
				caster, base = &m.Caster, &m.MessageBase
			}
		case *messages.Cast:
			if s.options.casts {
				caster, base = &m.Caster.Gid, &m.MessageBase
			}
		}
		if caster == nil {
			continue
		}
		bossEntry, ok := s.sourceBoss(*caster)
		if !ok {
			continue
		}
		// Ignore original participants even without a boss observation. Mark before
		// rewriting so the helper and targets cannot keep a completed pull alive.
		if reason := s.options.ignoreActivity; reason != "" {
			for _, id := range msg.Affects() {
				base.MarkActivityIgnore(reason, id)
			}
		}
		if boss := s.bosses[bossEntry]; !boss.IsZero() {
			if m, ok := msg.(*messages.Damage); ok {
				m.Caster = &boss // Do not mutate a pointer shared with another event.
			} else {
				*caster = boss
			}
			if reason := s.options.ignoreActivity; reason != "" {
				base.MarkActivityIgnore(reason, boss)
			}
		}
	}
}

func (s *shadowBosses) sourceBoss(id guid.GUID) (uint32, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return 0, false
	}
	for _, mapping := range s.mappings {
		for _, source := range mapping.sources {
			if source.entry == entry && (source.matches == nil || source.matches(id)) {
				return mapping.boss, true
			}
		}
	}
	return 0, false
}
