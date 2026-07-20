package synthetic

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// auraCastAbsorb creates an AuraCast event for an absorb effect (AuraEffectSchoolAbsorb).
func auraCastAbsorb(ts time.Time, spell *chrondbc.Spell, caster guid.GUID, target guid.GUID, schoolMask int32) *messages.AuraCast {
	return auraCastAbsorbWithDuration(ts, spell, caster, target, schoolMask, 0)
}

func auraCastAbsorbWithDuration(ts time.Time, spell *chrondbc.Spell, caster guid.GUID, target guid.GUID, schoolMask int32, durationMS int32) *messages.AuraCast {
	return &messages.AuraCast{
		MessageBase:     messages.Base(ts),
		Spell:           spell,
		Caster:          caster,
		Target:          &target,
		EffectAuraName:  chrondbc.AuraEffectSchoolAbsorb,
		EffectMiscValue: schoolMask,
		DurationMS:      durationMS,
	}
}

func makeAbsorbSpell(name string, basePoints int32, schoolMask int32) *chrondbc.Spell {
	return &chrondbc.Spell{
		Name_lang:        i18n.Text{i18n.English: name},
		EffectAura:       [3]chrondbc.AuraEffect{chrondbc.AuraEffectSchoolAbsorb},
		EffectBasePoints: [3]int32{basePoints},
		EffectDieSides:   [3]int32{1},
		EffectMiscValue:  [3]int32{schoolMask},
	}
}

func trailAbsorbed(amount uint32) types.Trailer {
	return types.Trailer{
		{Amount: &amount, HitType: types.HitTypePartialAbsorb},
	}
}

func TestAbsorption_AuraCastPWSPartialAbsorb(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	priestGUID := mustGUID("0x0000000000000001")
	tankGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	// PW:S is all-school (mask=0x7F = 127)
	pwsSpell := makeAbsorbSpell("Power Word: Shield", 500, 127)

	msgs := []messages.Message{
		// AuraCast: priest applies PW:S absorb effect on tank
		auraCastAbsorb(now, pwsSpell, priestGUID, tankGUID, 127),
		// Boss hits tank, 200 damage + 150 absorbed
		&messages.Damage{
			MessageBase: messages.Base(now.Add(2 * time.Second)),
			Caster:      &bossGUID,
			Target:      tankGUID,
			Amount:      200,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(150),
		},
	}

	result := a.ProcessMessages(msgs)
	// Should have 3 messages: auraCast, damage, synthetic absorbed
	require.Len(t, result, 3, "should append synthetic Absorbed after Damage")

	absorbed, ok := result[2].(*messages.Absorbed)
	require.True(t, ok, "3rd message should be Absorbed")
	assert.True(t, absorbed.IsSynthetic(), "should be marked synthetic")
	assert.Equal(t, int32(150), absorbed.Amount)
	assert.Equal(t, bossGUID, absorbed.Attacker)
	assert.Equal(t, tankGUID, absorbed.Target)
	assert.Equal(t, priestGUID, absorbed.Caster, "should attribute to priest from AuraCast")
	require.NotNil(t, absorbed.AbsorbSpell)
	assert.Equal(t, "Power Word: Shield", absorbed.AbsorbSpell.Name())
}

func TestAbsorption_DurationExpiry(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	priestGUID := mustGUID("0x0000000000000001")
	tankGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	pwsSpell := makeAbsorbSpell("Power Word: Shield", 500, 127)

	msgs := []messages.Message{
		// PW:S with 30s duration
		auraCastAbsorbWithDuration(now, pwsSpell, priestGUID, tankGUID, 127, 30000),
		// Damage 31s later — shield should have expired
		&messages.Damage{
			MessageBase: messages.Base(now.Add(31 * time.Second)),
			Caster:      &bossGUID,
			Target:      tankGUID,
			Amount:      200,
			HitType:     types.HitTypeHit,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(150),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 2, "should not emit absorbed after shield expired")
}

func TestAbsorption_DurationNotExpiredYet(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	priestGUID := mustGUID("0x0000000000000001")
	tankGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	pwsSpell := makeAbsorbSpell("Power Word: Shield", 500, 127)

	msgs := []messages.Message{
		// PW:S with 30s duration
		auraCastAbsorbWithDuration(now, pwsSpell, priestGUID, tankGUID, 127, 30000),
		// Damage 10s later — shield is still active
		&messages.Damage{
			MessageBase: messages.Base(now.Add(10 * time.Second)),
			Caster:      &bossGUID,
			Target:      tankGUID,
			Amount:      200,
			HitType:     types.HitTypeHit,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(150),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 3, "shield not expired yet — should emit absorbed")

	absorbed := result[2].(*messages.Absorbed)
	assert.Equal(t, int32(150), absorbed.Amount)
}

func TestAbsorption_WardPrioritizedOverPWS(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	fireWardSpell := makeAbsorbSpell("Fire Ward", 300, int32(types.FireSchool))
	pwsSpell := makeAbsorbSpell("Power Word: Shield", 500, 127)

	msgs := []messages.Message{
		auraCastAbsorb(now, pwsSpell, casterGUID, targetGUID, 127),
		auraCastAbsorb(now.Add(100*time.Millisecond), fireWardSpell, targetGUID, targetGUID, int32(types.FireSchool)),
		&messages.Damage{
			MessageBase: messages.Base(now.Add(2 * time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.FireSchool,
			Trailer:     trailAbsorbed(200),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 4)

	absorbed := result[3].(*messages.Absorbed)
	require.NotNil(t, absorbed.AbsorbSpell)
	assert.Equal(t, "Fire Ward", absorbed.AbsorbSpell.Name(),
		"should prefer school-specific Fire Ward over all-school PW:S for fire damage")
}

func TestAbsorption_WardDoesNotMatchWrongSchool(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	fireWardSpell := makeAbsorbSpell("Fire Ward", 300, int32(types.FireSchool))

	msgs := []messages.Message{
		auraCastAbsorb(now, fireWardSpell, targetGUID, targetGUID, int32(types.FireSchool)),
		&messages.Damage{
			MessageBase: messages.Base(now.Add(time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(50),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 2, "should not emit absorbed when no matching school shield")
}

func TestAbsorption_CapacityExhaustion(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	// Base 100 + 1 die → estimated capacity = (100+1)*2 = 202
	pwsSpell := makeAbsorbSpell("Power Word: Shield", 100, 127)

	msgs := []messages.Message{
		auraCastAbsorb(now, pwsSpell, casterGUID, targetGUID, 127),
		// Hit 1: absorbs 150 → remaining = 202-150 = 52
		&messages.Damage{
			MessageBase: messages.Base(now.Add(time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(150),
		},
		// Hit 2: absorbs 100 → remaining = 52-100 = -48 → exhausted
		&messages.Damage{
			MessageBase: messages.Base(now.Add(2 * time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(100),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 5, "auraCast + dmg + absorbed + dmg + absorbed")
	abs1, ok1 := result[2].(*messages.Absorbed)
	abs2, ok2 := result[4].(*messages.Absorbed)
	require.True(t, ok1)
	require.True(t, ok2)
	assert.Equal(t, int32(150), abs1.Amount)
	assert.Equal(t, int32(100), abs2.Amount)
}

func TestAbsorption_SelfCastViaAuraCast(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	mageGUID := mustGUID("0x0000000000000001")
	bossGUID := mustGUID("0x0030000000000003")

	fireWardSpell := makeAbsorbSpell("Fire Ward", 300, int32(types.FireSchool))

	msgs := []messages.Message{
		// AuraCast with caster == target (self-cast)
		auraCastAbsorb(now, fireWardSpell, mageGUID, mageGUID, int32(types.FireSchool)),
		&messages.Damage{
			MessageBase: messages.Base(now.Add(time.Second)),
			Caster:      &bossGUID,
			Target:      mageGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.FireSchool,
			Trailer:     trailAbsorbed(200),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 3)

	absorbed := result[2].(*messages.Absorbed)
	assert.Equal(t, mageGUID, absorbed.Caster,
		"AuraCast carries caster directly, even for self-cast")
}

func TestAbsorption_TrailerAbsorbWithoutHitTypeFlag(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	pwsSpell := makeAbsorbSpell("Power Word: Shield", 500, 127)

	msgs := []messages.Message{
		auraCastAbsorb(now, pwsSpell, casterGUID, targetGUID, 127),
		// Damage with absorb in trailer but NO HitTypePartialAbsorb on parent HitType
		&messages.Damage{
			MessageBase: messages.Base(now.Add(time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      200,
			HitType:     types.HitTypeHit, // no PartialAbsorb flag
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(100),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 3, "should emit absorbed even without HitType flag when trailer has absorb")

	absorbed, ok := result[2].(*messages.Absorbed)
	require.True(t, ok)
	assert.Equal(t, int32(100), absorbed.Amount)
	assert.True(t, absorbed.IsSynthetic())
}

func TestAbsorption_FullAbsorbSkipped(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	pwsSpell := makeAbsorbSpell("Power Word: Shield", 500, 127)

	msgs := []messages.Message{
		auraCastAbsorb(now, pwsSpell, casterGUID, targetGUID, 127),
		// Full absorb (no amount in trailer)
		&messages.Damage{
			MessageBase: messages.Base(now.Add(time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      0,
			HitType:     types.HitTypeFullAbsorb,
			School:      types.PhysicalSchool,
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 2, "full absorb should not emit synthetic event")
}

func TestAbsorption_NoShieldNoEmit(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	msgs := []messages.Message{
		// Damage with absorb but no shield tracked
		&messages.Damage{
			MessageBase: messages.Base(now),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(50),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 1, "no shield tracked — should not emit absorbed")
}

func TestAbsorption_NonAbsorbAuraCastIgnored(t *testing.T) {
	t.Parallel()

	a := newAbsorption(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0000000000000002")
	bossGUID := mustGUID("0x0030000000000003")

	nonAbsorbSpell := &chrondbc.Spell{
		Name_lang:  i18n.Text{i18n.English: "Renew"},
		EffectAura: [3]chrondbc.AuraEffect{chrondbc.AuraEffectPeriodicHeal},
	}

	msgs := []messages.Message{
		// AuraCast with non-absorb aura effect — should be ignored
		&messages.AuraCast{
			MessageBase:    messages.Base(now),
			Spell:          nonAbsorbSpell,
			Caster:         casterGUID,
			Target:         &targetGUID,
			EffectAuraName: chrondbc.AuraEffectPeriodicHeal,
		},
		&messages.Damage{
			MessageBase: messages.Base(now.Add(time.Second)),
			Caster:      &bossGUID,
			Target:      targetGUID,
			Amount:      100,
			HitType:     types.HitTypeHit | types.HitTypePartialAbsorb,
			School:      types.PhysicalSchool,
			Trailer:     trailAbsorbed(50),
		},
	}

	result := a.ProcessMessages(msgs)
	require.Len(t, result, 2, "non-absorb AuraCast should not create a shield")
}
