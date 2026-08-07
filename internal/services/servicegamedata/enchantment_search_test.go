package servicegamedata

import "testing"

func TestEnchantSlotMasks(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name         string
		invTypes     []int32
		wantInvMask  int32
		wantWeapon   bool
		wantSubclass int32
	}{
		{name: "empty", invTypes: nil},
		{
			name:         "head",
			invTypes:     []int32{1},
			wantInvMask:  1 << 1,
			wantSubclass: 0,
		},
		{
			name:         "chest with robe",
			invTypes:     []int32{5, 20},
			wantInvMask:  1<<5 | 1<<20,
			wantSubclass: 0,
		},
		{
			name:         "main hand",
			invTypes:     []int32{13, 17, 21},
			wantInvMask:  1<<13 | 1<<17 | 1<<21,
			wantSubclass: meleeWeaponSubclassMask,
		},
		{
			name:         "off hand includes shield and holdable",
			invTypes:     []int32{13, 14, 22, 23},
			wantInvMask:  1<<13 | 1<<14 | 1<<22 | 1<<23,
			wantSubclass: meleeWeaponSubclassMask,
		},
		{
			name:         "ranged gets scope subclasses not melee",
			invTypes:     []int32{15, 25, 26, 28},
			wantInvMask:  1<<15 | 1<<25 | 1<<26 | 1<<28,
			wantSubclass: rangedWeaponSubclassMask,
		},
		{
			name:        "out of range ignored",
			invTypes:    []int32{-1, 31, 64},
			wantInvMask: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			invMask, subclassMask := enchantSlotMasks(tc.invTypes)
			if invMask != tc.wantInvMask {
				t.Errorf("invMask = %#x, want %#x", invMask, tc.wantInvMask)
			}
			if subclassMask != tc.wantSubclass {
				t.Errorf("weaponSubclassMask = %#x, want %#x", subclassMask, tc.wantSubclass)
			}
		})
	}

	// Melee and ranged subclass masks must never overlap, or scopes would
	// show up for melee slots and weapon enchants for ranged.
	if meleeWeaponSubclassMask&rangedWeaponSubclassMask != 0 {
		t.Fatalf("melee and ranged subclass masks overlap: %#x", meleeWeaponSubclassMask&rangedWeaponSubclassMask)
	}
}
