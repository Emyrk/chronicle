package servicegamedata

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

type socketBonusStore struct {
	database.Store
	enchantment database.DbcSpellItemEnchantment
	err         error
}

func (s socketBonusStore) GetSpellItemEnchantmentByID(context.Context, database.GetSpellItemEnchantmentByIDParams) (database.DbcSpellItemEnchantment, error) {
	return s.enchantment, s.err
}

func TestApplySocketBonus(t *testing.T) {
	t.Parallel()

	t.Run("resolves enchantment name", func(t *testing.T) {
		t.Parallel()

		tooltip := chroniclesdk.ItemTooltip{}
		applySocketBonus(context.Background(), socketBonusStore{
			enchantment: database.DbcSpellItemEnchantment{
				ID:       3308,
				NameLang: "+4 Haste Rating",
			},
		}, &tooltip, 3308, uuid.Nil)

		if tooltip.SocketBonus == nil {
			t.Fatal("socket bonus was not set")
		}
		if tooltip.SocketBonus.EnchantmentID != 3308 {
			t.Errorf("enchantment ID = %d, want 3308", tooltip.SocketBonus.EnchantmentID)
		}
		if tooltip.SocketBonus.Name != "+4 Haste Rating" {
			t.Errorf("name = %q, want %q", tooltip.SocketBonus.Name, "+4 Haste Rating")
		}
	})

	t.Run("omits unresolved enchantment", func(t *testing.T) {
		t.Parallel()

		tooltip := chroniclesdk.ItemTooltip{}
		applySocketBonus(context.Background(), socketBonusStore{err: errors.New("not found")}, &tooltip, 3308, uuid.Nil)

		if tooltip.SocketBonus != nil {
			t.Errorf("socket bonus = %+v, want nil", tooltip.SocketBonus)
		}
	})
}
