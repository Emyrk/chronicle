package wdb

import "fmt"

// Build-number thresholds for WDB format changes.
const (
	// buildSoundOverride is the build that added SoundOverrideSubClass after SubClass.
	buildSoundOverride = 6022
	// buildTBC is the earliest TBC client build (~2.0.1). Adds sockets, gems,
	// RequiredDisenchantSkill, and ArmorDamageModifier. Damage slots shrink from 5→2.
	buildTBC = 6180
	// buildWotLK is the earliest WotLK client build (3.0.1 beta). Adds Flags2,
	// variable StatsCount, ScalingStatDistribution/Value, Duration,
	// ItemLimitCategory, and HolidayID. Build 8606 is TBC 2.4.3 and still uses
	// the TBC item cache layout.
	buildWotLK = 8622
)

// Item represents a parsed item from itemcache.wdb.
// Field layout varies by client build; see ParseItem for version-aware parsing.
type Item struct {
	Entry                   uint32
	Class                   uint32
	SubClass                uint32
	SoundOverrideSubClass   int32 // build >= 6022
	Name                    string
	Name2, Name3, Name4     string
	DisplayID               uint32
	Quality                 uint32
	Flags                   uint32
	Flags2                  uint32 // build >= 8606 (WotLK)
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
	StatsCount              uint32 // WotLK only; vanilla/TBC always write 10 pairs
	StatType                [10]uint32
	StatValue               [10]int32
	ScalingStatDistribution int32      // build >= 8622 (WotLK)
	ScalingStatValue        int32      // build >= 8622 (WotLK)
	DmgMin                  [5]float32 // vanilla: 5 slots; TBC+: only [0:2] populated
	DmgMax                  [5]float32
	DmgType                 [5]uint32
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
	SocketColor             [3]uint32 // build >= 6180 (TBC)
	SocketContent           [3]uint32 // build >= 6180 (TBC)
	SocketBonus             uint32    // build >= 6180 (TBC)
	GemProperties           uint32    // build >= 6180 (TBC)
	RequiredDisenchantSkill int32     // build >= 6180 (TBC)
	ArmorDamageModifier     float32   // build >= 6180 (TBC)
	Duration                int32     // build >= 8622 (WotLK)
	ItemLimitCategory       int32     // build >= 8622 (WotLK)
	HolidayID               int32     // build >= 8622 (WotLK)
}

// ParseItem parses a single item record from itemcache.wdb.
// build is the client build number from the WDB header (Header.Version).
// The binary layout differs between vanilla (≤5875), TBC, and WotLK clients.
func ParseItem(rec Record, build uint32) (Item, error) {
	it := Item{Entry: rec.EntryID}
	r := newReader(rec.Data)
	var err error

	u := func() uint32 {
		var v uint32
		if err == nil {
			v, err = r.Uint32()
		}
		return v
	}
	i := func() int32 {
		var v int32
		if err == nil {
			v, err = r.Int32()
		}
		return v
	}
	f := func() float32 {
		var v float32
		if err == nil {
			v, err = r.Float32()
		}
		return v
	}
	s := func() string {
		var v string
		if err == nil {
			v, err = r.String()
		}
		return v
	}

	it.Class = u()
	it.SubClass = u()
	if build >= buildSoundOverride {
		it.SoundOverrideSubClass = i()
	}
	it.Name = s()
	it.Name2 = s()
	it.Name3 = s()
	it.Name4 = s()
	it.DisplayID = u()
	it.Quality = u()
	it.Flags = u()
	if build >= buildWotLK {
		it.Flags2 = u()
	}
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

	if build >= buildWotLK {
		// WotLK: variable-length stat section preceded by count.
		it.StatsCount = u()
		for j := range int(it.StatsCount) {
			if j >= 10 {
				break
			}
			it.StatType[j] = u()
			it.StatValue[j] = i()
		}
	} else {
		// Vanilla/TBC: always 10 stat pairs, no count prefix.
		it.StatsCount = 10
		for j := range 10 {
			it.StatType[j] = u()
			it.StatValue[j] = i()
		}
	}

	if build >= buildWotLK {
		it.ScalingStatDistribution = i()
		it.ScalingStatValue = i()
	}

	// Vanilla has 5 damage slots; TBC+ reduced to 2.
	dmgSlots := 5
	if build >= buildTBC {
		dmgSlots = 2
	}
	for j := range dmgSlots {
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
	if build >= buildTBC {
		it.RandomSuffix = i() // TBC+ only
	}
	it.Block = u()
	it.ItemSet = u()
	it.MaxDurability = u()
	it.Area = u()
	it.Map = u()
	it.BagFamily = u()
	if build >= buildTBC {
		it.TotemCategory = u() // TBC+ only
	}

	if build >= buildTBC {
		for j := range 3 {
			it.SocketColor[j] = u()
			it.SocketContent[j] = u()
		}
		it.SocketBonus = u()
		it.GemProperties = u()
		it.RequiredDisenchantSkill = i()
		it.ArmorDamageModifier = f()
	}

	if build >= buildWotLK {
		it.Duration = i()
		it.ItemLimitCategory = i()
		it.HolidayID = i()
	}

	if err != nil {
		return it, fmt.Errorf("parse item %d: %w", rec.EntryID, err)
	}
	return it, nil
}
