package simulation

// SimResults holds the outcome of a simulation run.
type SimResults struct {
	DurationMs     int32
	TotalDamage    int64
	DPS            float64
	SpellBreakdown map[int32]*SpellBreakdown
}

// SpellBreakdown tracks per-spell statistics.
type SpellBreakdown struct {
	SpellID    int32
	Name       string
	Casts      int32
	Hits       int32
	Crits      int32
	Misses     int32
	Ticks      int32
	TotalDmg   int64
	AvgHit     float64
	AvgCrit    float64
	DPS        float64
	DPSPercent float64
}

// Finalize computes derived fields (DPS, averages, percentages).
func (r *SimResults) Finalize() {
	if r.DurationMs > 0 {
		r.DPS = float64(r.TotalDamage) / (float64(r.DurationMs) / 1000.0)
	}
	for _, b := range r.SpellBreakdown {
		if r.DurationMs > 0 {
			b.DPS = float64(b.TotalDmg) / (float64(r.DurationMs) / 1000.0)
		}
		if r.TotalDamage > 0 {
			b.DPSPercent = float64(b.TotalDmg) / float64(r.TotalDamage) * 100.0
		}
		if b.Hits > 0 {
			b.AvgHit = float64(b.TotalDmg) / float64(b.Hits+b.Crits)
		}
	}
}

func (r *SimResults) recordDamage(spellID int32, spellName string, dmg int32, isCrit, isMiss, isTick bool) {
	if r.SpellBreakdown == nil {
		r.SpellBreakdown = make(map[int32]*SpellBreakdown)
	}
	b, ok := r.SpellBreakdown[spellID]
	if !ok {
		b = &SpellBreakdown{SpellID: spellID, Name: spellName}
		r.SpellBreakdown[spellID] = b
	}
	if isMiss {
		b.Misses++
		return
	}
	if isTick {
		b.Ticks++
	} else if isCrit {
		b.Crits++
		b.Casts++
	} else {
		b.Hits++
		b.Casts++
	}
	b.TotalDmg += int64(dmg)
	r.TotalDamage += int64(dmg)
}
