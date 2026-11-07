package cli

import "testing"

func TestApplySkinOverrides(t *testing.T) {
	t.Parallel()

	defaults := [3]string{"default-one", "default-two", "default-three"}
	for _, test := range []struct {
		name string
		spec string
		want [3]string
	}{
		{name: "defaults", want: defaults},
		{name: "legacy single slot", spec: "skin-one", want: [3]string{"skin-one", "default-two", "default-three"}},
		{name: "three slots", spec: "skin-one|skin-two|skin-three", want: [3]string{"skin-one", "skin-two", "skin-three"}},
		{name: "preserve empty slot", spec: "skin-one||skin-three", want: [3]string{"skin-one", "default-two", "skin-three"}},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := applySkinOverrides(defaults, test.spec); got != test.want {
				t.Fatalf("applySkinOverrides(%q) = %q; want %q", test.spec, got, test.want)
			}
		})
	}
}

func TestM2AnimationClipName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		id        uint16
		variation int
		want      string
		wantOK    bool
	}{
		{name: "canonical locomotion", id: 4, want: "Walk", wantOK: true},
		{name: "duplicate locomotion omitted", id: 4, variation: 1},
		{name: "canonical attack", id: 16, want: "AttackUnarmed", wantOK: true},
		{name: "second attack variant", id: 16, variation: 1, want: "AttackUnarmed2", wantOK: true},
		{name: "third attack variant", id: 16, variation: 2, want: "AttackUnarmed3", wantOK: true},
		{name: "spell cast", id: 53, want: "SpellCastDirected", wantOK: true},
		{name: "boss special", id: 201, want: "Submerge", wantOK: true},
		{name: "unselected emote", id: 69},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, ok := m2AnimationClipName(test.id, test.variation)
			if got != test.want || ok != test.wantOK {
				t.Fatalf("m2AnimationClipName(%d, %d) = %q, %v; want %q, %v", test.id, test.variation, got, ok, test.want, test.wantOK)
			}
		})
	}
}

func TestM2ExportAnimationsIncludesCombatClips(t *testing.T) {
	t.Parallel()

	for id, want := range map[uint16]string{
		1:   "Death",
		9:   "CombatWound",
		10:  "CombatCritical",
		16:  "AttackUnarmed",
		17:  "Attack1H",
		32:  "SpellCast",
		53:  "SpellCastDirected",
		54:  "SpellCastOmni",
		118: "SpecialUnarmed",
		124: "ChannelCastDirected",
		125: "ChannelCastOmni",
		126: "Whirlwind",
		127: "Birth",
		181: "DragonStomp",
		201: "Submerge",
		202: "Submerged",
	} {
		if got := m2ExportAnimations[id]; got != want {
			t.Errorf("animation %d = %q; want %q", id, got, want)
		}
	}
}
