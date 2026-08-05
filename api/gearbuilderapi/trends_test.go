package gearbuilderapi

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
)

func TestAssembleTrends(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)

	t.Run("insufficient sample", func(t *testing.T) {
		t.Parallel()
		items := []database.GearTrendsSlotItemsRow{
			{Slot: 0, ItemID: 100, WearerCount: 10, CohortSize: 12, ItemName: "Helm"},
		}
		resp := assembleTrends(items, nil, "WARRIOR", "Fury", 60, now)
		if !resp.InsufficientSample {
			t.Fatal("expected insufficient_sample for cohort of 12")
		}
		if len(resp.Slots) != 0 {
			t.Fatalf("expected no slots, got %d", len(resp.Slots))
		}
		if resp.CohortSize != 12 {
			t.Fatalf("cohort_size = %d, want 12", resp.CohortSize)
		}
	})

	t.Run("empty cohort", func(t *testing.T) {
		t.Parallel()
		resp := assembleTrends(nil, nil, "MAGE", "Frost", 30, now)
		if !resp.InsufficientSample || resp.CohortSize != 0 {
			t.Fatalf("expected empty insufficient response, got %+v", resp)
		}
	})

	t.Run("percentages, caps, and enchant grouping", func(t *testing.T) {
		t.Parallel()
		var items []database.GearTrendsSlotItemsRow
		// Slot 0: 20 distinct items to exercise the per-slot cap.
		for i := 0; i < 20; i++ {
			items = append(items, database.GearTrendsSlotItemsRow{
				Slot: 0, ItemID: int32(100 + i), WearerCount: int32(40 - i), CohortSize: 40,
				ItemName: "Item", ItemQuality: 4, ItemLevel: 63,
			})
		}
		// Slot 15: one item worn by half the cohort.
		items = append(items, database.GearTrendsSlotItemsRow{
			Slot: 15, ItemID: 500, WearerCount: 20, CohortSize: 40, ItemName: "Sword",
		})
		enchants := []database.GearTrendsSlotEnchantsRow{
			{Slot: 15, EnchantID: 1900, WearerCount: 10, CohortSize: 40, EnchantName: "Crusader"},
			{Slot: 15, EnchantID: 7, WearerCount: 2, CohortSize: 40, EnchantName: ""},
			{Slot: 7, EnchantID: 911, WearerCount: 3, CohortSize: 40, EnchantName: "Minor Speed"},
		}

		resp := assembleTrends(items, enchants, "WARRIOR", "Fury", 90, now)
		if resp.InsufficientSample {
			t.Fatal("cohort of 40 should be sufficient")
		}
		if len(resp.Slots) != 2 {
			t.Fatalf("expected 2 slots, got %d", len(resp.Slots))
		}

		head := resp.Slots[0]
		if head.Slot != 0 || len(head.Items) != trendsMaxItemsPerSlot {
			t.Fatalf("slot 0: got slot=%d items=%d, want capped at %d", head.Slot, len(head.Items), trendsMaxItemsPerSlot)
		}
		if head.Items[0].Percent != 100 {
			t.Fatalf("top item percent = %v, want 100", head.Items[0].Percent)
		}
		if head.Items[0].ItemLevel == nil || *head.Items[0].ItemLevel != 63 {
			t.Fatalf("item level not carried through: %+v", head.Items[0])
		}

		weapon := resp.Slots[1]
		if weapon.Slot != 15 || weapon.Items[0].Percent != 50 {
			t.Fatalf("slot 15 percent = %+v, want 50%%", weapon.Items[0])
		}
		if len(weapon.Enchants) != 2 {
			t.Fatalf("slot 15 enchants = %d, want 2", len(weapon.Enchants))
		}
		if weapon.Enchants[0].Name != "Crusader" || weapon.Enchants[0].Percent != 25 {
			t.Fatalf("enchant 0 = %+v", weapon.Enchants[0])
		}
		if weapon.Enchants[1].Name != "Enchant #7" {
			t.Fatalf("unnamed enchant should get a fallback name, got %q", weapon.Enchants[1].Name)
		}
		// Slot 7 has no visible items, so its enchant row is dropped.
		for _, s := range resp.Slots {
			if s.Slot == 7 {
				t.Fatal("slot 7 should not appear")
			}
		}
	})
}

func TestNormalizePlayableClass(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in   string
		want string
		ok   bool
	}{
		{"WARRIOR", "WARRIOR", true},
		{"warrior", "WARRIOR", true},
		{" druid ", "DRUID", true},
		{"DEATHKNIGHT", "DEATH_KNIGHT", true},
		{"DEATH_KNIGHT", "DEATH_KNIGHT", true},
		{"", "", false},
		{"GNOME", "", false},
		{"PANDAREN", "", false},
	}
	for _, tt := range tests {
		got, ok := normalizePlayableClass(tt.in)
		if got != tt.want || ok != tt.ok {
			t.Errorf("normalizePlayableClass(%q) = (%q, %v), want (%q, %v)", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}
