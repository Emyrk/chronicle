// Package jsonprovider implements gamedata.DataProvider backed by in-memory
// maps loaded from JSON. WASM-safe.
package jsonprovider

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/Emyrk/chronicle/simulation/gamedata"
)

type baseStatsKey struct {
	Race, Class, Level int32
}

// Provider satisfies gamedata.DataProvider using in-memory maps.
type Provider struct {
	spells      map[int32]gamedata.SpellData
	items       map[int32]gamedata.ItemData
	creatures   map[uint32]gamedata.CreatureData
	setBonuses  map[int32][]gamedata.SetBonusData
	classSpells map[int32][]int32
	baseStats   map[baseStatsKey]gamedata.PlayerBaseStats
}

// New creates an empty Provider. Call Load* methods to populate.
func New() *Provider {
	return &Provider{
		spells:      make(map[int32]gamedata.SpellData),
		items:       make(map[int32]gamedata.ItemData),
		creatures:   make(map[uint32]gamedata.CreatureData),
		setBonuses:  make(map[int32][]gamedata.SetBonusData),
		classSpells: make(map[int32][]int32),
		baseStats:   make(map[baseStatsKey]gamedata.PlayerBaseStats),
	}
}

func (p *Provider) GetSpell(id int32) (gamedata.SpellData, bool) {
	s, ok := p.spells[id]
	return s, ok
}

func (p *Provider) GetItem(id int32) (gamedata.ItemData, bool) {
	i, ok := p.items[id]
	return i, ok
}

func (p *Provider) GetCreature(entryID uint32) (gamedata.CreatureData, bool) {
	c, ok := p.creatures[entryID]
	return c, ok
}

func (p *Provider) GetSetBonuses(setID int32) ([]gamedata.SetBonusData, bool) {
	b, ok := p.setBonuses[setID]
	return b, ok
}

func (p *Provider) GetSpellsForClass(classID int32) ([]int32, error) {
	s, ok := p.classSpells[classID]
	if !ok {
		return nil, fmt.Errorf("no spells for class %d", classID)
	}
	return s, nil
}

func (p *Provider) GetPlayerBaseStats(race, class, level int32) (gamedata.PlayerBaseStats, bool) {
	s, ok := p.baseStats[baseStatsKey{race, class, level}]
	return s, ok
}

// AddSpell adds a single spell to the provider.
func (p *Provider) AddSpell(s gamedata.SpellData) {
	p.spells[s.ID] = s
}

// AddItem adds a single item to the provider.
func (p *Provider) AddItem(i gamedata.ItemData) {
	p.items[i.ID] = i
}

// AddCreature adds a single creature to the provider.
func (p *Provider) AddCreature(c gamedata.CreatureData) {
	p.creatures[c.EntryID] = c
}

// LoadSpells loads spells from a JSON array.
func (p *Provider) LoadSpells(data []byte) error {
	var spells []gamedata.SpellData
	if err := json.Unmarshal(data, &spells); err != nil {
		return fmt.Errorf("unmarshal spells: %w", err)
	}
	for _, s := range spells {
		p.spells[s.ID] = s
	}
	return nil
}

// LoadItems loads items from a JSON array.
func (p *Provider) LoadItems(data []byte) error {
	var items []gamedata.ItemData
	if err := json.Unmarshal(data, &items); err != nil {
		return fmt.Errorf("unmarshal items: %w", err)
	}
	for _, i := range items {
		p.items[i.ID] = i
	}
	return nil
}

// LoadCreatures loads creatures from a JSON array.
func (p *Provider) LoadCreatures(data []byte) error {
	var creatures []gamedata.CreatureData
	if err := json.Unmarshal(data, &creatures); err != nil {
		return fmt.Errorf("unmarshal creatures: %w", err)
	}
	for _, c := range creatures {
		p.creatures[c.EntryID] = c
	}
	return nil
}

// LoadSetBonuses loads set bonuses from a JSON array.
func (p *Provider) LoadSetBonuses(data []byte) error {
	var bonuses []gamedata.SetBonusData
	if err := json.Unmarshal(data, &bonuses); err != nil {
		return fmt.Errorf("unmarshal set bonuses: %w", err)
	}
	for _, b := range bonuses {
		p.setBonuses[b.SetID] = append(p.setBonuses[b.SetID], b)
	}
	return nil
}

// LoadClassSpells loads class spells from a JSON object: {"1": [spellID, ...], ...}.
func (p *Provider) LoadClassSpells(data []byte) error {
	var raw map[string][]int32
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("unmarshal class spells: %w", err)
	}
	for k, v := range raw {
		classID, err := strconv.Atoi(k)
		if err != nil {
			return fmt.Errorf("invalid class ID %q: %w", k, err)
		}
		p.classSpells[int32(classID)] = v
	}
	return nil
}

// LoadPlayerBaseStats loads base stats from JSON array with race/class/level keys.
func (p *Provider) LoadPlayerBaseStats(data []byte) error {
	type entry struct {
		Race  int32                   `json:"race"`
		Class int32                   `json:"class"`
		Level int32                   `json:"level"`
		Stats gamedata.PlayerBaseStats `json:"stats"`
	}
	var entries []entry
	if err := json.Unmarshal(data, &entries); err != nil {
		return fmt.Errorf("unmarshal base stats: %w", err)
	}
	for _, e := range entries {
		p.baseStats[baseStatsKey{e.Race, e.Class, e.Level}] = e.Stats
	}
	return nil
}

// SetPlayerBaseStats directly sets base stats for a race/class/level combo.
func (p *Provider) SetPlayerBaseStats(race, class, level int32, stats gamedata.PlayerBaseStats) {
	p.baseStats[baseStatsKey{race, class, level}] = stats
}

// Compile-time interface check.
var _ gamedata.DataProvider = (*Provider)(nil)
