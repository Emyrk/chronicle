package wdb

import "fmt"

// Item represents a parsed item from itemcache.wdb.
// Field layout validated against WotLK 3.3.5a (build 12340, recordVersion 5).
type Item struct {
	Entry                   uint32
	Class                   uint32
	SubClass                uint32
	SoundOverrideSubClass   int32
	Name                    string
	Name2, Name3, Name4     string
	DisplayID               uint32
	Quality                 uint32
	Flags                   uint32
	Flags2                  uint32
	BuyPrice                uint32
	SellPrice               uint32
	InventoryType           uint32
	AllowableClass          int32
	AllowableRace           int32
	ItemLevel               uint32
	RequiredLevel           uint32
	RequiredSkill           uint32
	RequiredSkillRank       uint32
	RequiredSpell           uint32
	RequiredHonorRank       uint32
	RequiredCityRank        uint32
	RequiredRepFaction      uint32
	RequiredRepRank         uint32
	MaxCount                int32
	Stackable               int32
	ContainerSlots          uint32
	StatsCount              uint32
	StatType                [10]uint32
	StatValue               [10]int32
	ScalingStatDistribution int32
	ScalingStatValue        int32
	DmgMin                  [2]float32
	DmgMax                  [2]float32
	DmgType                 [2]uint32
	Armor                   uint32
	HolyRes                 uint32
	FireRes                 uint32
	NatureRes               uint32
	FrostRes                uint32
	ShadowRes               uint32
	ArcaneRes               uint32
	Delay                   uint32
	AmmoType                uint32
	RangedModRange          float32
	SpellID                 [5]int32
	SpellTrigger            [5]uint32
	SpellCharges            [5]int32
	SpellCooldown           [5]int32
	SpellCategory           [5]uint32
	SpellCategoryCooldown   [5]int32
	Bonding                 uint32
	Description             string
	PageText                uint32
	LanguageID              uint32
	PageMaterial            uint32
	StartQuest              uint32
	LockID                  uint32
	Material                int32
	Sheath                  uint32
	RandomProperty          int32
	RandomSuffix            int32
	Block                   uint32
	ItemSet                 uint32
	MaxDurability           uint32
	Area                    uint32
	Map                     uint32
	BagFamily               uint32
	TotemCategory           uint32
	SocketColor             [3]uint32
	SocketContent           [3]uint32
	SocketBonus             uint32
	GemProperties           uint32
	RequiredDisenchantSkill int32
	ArmorDamageModifier     float32
	Duration                int32
	ItemLimitCategory       int32
	HolidayID               int32
}

// ParseItem parses a single item record from itemcache.wdb.
// The entry ID comes from the Record; data is the record payload.
func ParseItem(rec Record) (Item, error) {
	it := Item{Entry: rec.EntryID}
	r := newReader(rec.Data)
	var err error

	u := func() uint32 { var v uint32; if err == nil { v, err = r.Uint32() }; return v }
	i := func() int32  { var v int32;  if err == nil { v, err = r.Int32() };  return v }
	f := func() float32 { var v float32; if err == nil { v, err = r.Float32() }; return v }
	s := func() string { var v string; if err == nil { v, err = r.String() }; return v }

	it.Class = u()
	it.SubClass = u()
	it.SoundOverrideSubClass = i()
	it.Name = s()
	it.Name2 = s()
	it.Name3 = s()
	it.Name4 = s()
	it.DisplayID = u()
	it.Quality = u()
	it.Flags = u()
	it.Flags2 = u()
	it.BuyPrice = u()
	it.SellPrice = u()
	it.InventoryType = u()
	it.AllowableClass = i()
	it.AllowableRace = i()
	it.ItemLevel = u()
	it.RequiredLevel = u()
	it.RequiredSkill = u()
	it.RequiredSkillRank = u()
	it.RequiredSpell = u()
	it.RequiredHonorRank = u()
	it.RequiredCityRank = u()
	it.RequiredRepFaction = u()
	it.RequiredRepRank = u()
	it.MaxCount = i()
	it.Stackable = i()
	it.ContainerSlots = u()
	it.StatsCount = u()
	// Only StatsCount stat pairs are stored in the cache (not always 10).
	for j := range int(it.StatsCount) {
		if j >= 10 {
			break
		}
		it.StatType[j] = u()
		it.StatValue[j] = i()
	}
	it.ScalingStatDistribution = i()
	it.ScalingStatValue = i()
	for j := range 2 {
		it.DmgMin[j] = f()
		it.DmgMax[j] = f()
		it.DmgType[j] = u()
	}
	it.Armor = u()
	it.HolyRes = u()
	it.FireRes = u()
	it.NatureRes = u()
	it.FrostRes = u()
	it.ShadowRes = u()
	it.ArcaneRes = u()
	it.Delay = u()
	it.AmmoType = u()
	it.RangedModRange = f()
	for j := range 5 {
		it.SpellID[j] = i()
		it.SpellTrigger[j] = u()
		it.SpellCharges[j] = i()
		it.SpellCooldown[j] = i()
		it.SpellCategory[j] = u()
		it.SpellCategoryCooldown[j] = i()
	}
	it.Bonding = u()
	it.Description = s()
	it.PageText = u()
	it.LanguageID = u()
	it.PageMaterial = u()
	it.StartQuest = u()
	it.LockID = u()
	it.Material = i()
	it.Sheath = u()
	it.RandomProperty = i()
	it.RandomSuffix = i()
	it.Block = u()
	it.ItemSet = u()
	it.MaxDurability = u()
	it.Area = u()
	it.Map = u()
	it.BagFamily = u()
	it.TotemCategory = u()
	for j := range 3 {
		it.SocketColor[j] = u()
		it.SocketContent[j] = u()
	}
	it.SocketBonus = u()
	it.GemProperties = u()
	it.RequiredDisenchantSkill = i()
	it.ArmorDamageModifier = f()
	it.Duration = i()
	it.ItemLimitCategory = i()
	it.HolidayID = i()

	if err != nil {
		return it, fmt.Errorf("parse item %d: %w", rec.EntryID, err)
	}
	return it, nil
}
