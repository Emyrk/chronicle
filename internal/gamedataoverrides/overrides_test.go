package gamedataoverrides

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/require"
)

func TestApplySpell(t *testing.T) {
	t.Parallel()

	berserk := &chrondbc.Spell{
		ID:       45708,
		Duration: dbcmem.SpellDuration{ID: 407, Duration: 100, MaxDuration: 100},
	}
	ApplySpell(database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
	}, berserk)
	require.Equal(t, int32(20_000), berserk.Duration.Duration)
	require.Equal(t, int32(20_000), berserk.Duration.MaxDuration)
	require.Equal(t, int32(407), berserk.Duration.ID)

	vanilla := &chrondbc.Spell{
		ID:       45708,
		Duration: dbcmem.SpellDuration{ID: 407, Duration: 100, MaxDuration: 100},
	}
	ApplySpell(database.WoWFlavor{database.FlavorVanilla}, vanilla)
	require.Equal(t, int32(100), vanilla.Duration.MaxDuration)

	otherSpell := &chrondbc.Spell{
		ID:       45709,
		Duration: dbcmem.SpellDuration{ID: 18, Duration: 20_000, MaxDuration: 20_000},
	}
	ApplySpell(database.WoWFlavor{database.FlavorNightmareOfUrsol}, otherSpell)
	require.Equal(t, int32(20_000), otherSpell.Duration.MaxDuration)
}

func TestApplySpellsBerserking(t *testing.T) {
	t.Parallel()

	cast := &chrondbc.Spell{
		ID:               20554,
		Description_lang: i18n.Text{i18n.English: "Increases attack and casting speed."},
		SpellIcon:        dbcmem.SpellIcon{ID: 1661, TextureFilename: "Racial_Troll_Berserk"},
		SpellIconID_:     1661,
	}
	aura := &chrondbc.Spell{
		ID:                   26635,
		AuraDescription_lang: i18n.Text{i18n.English: "Attack and casting speed increased."},
		DurationIndex_:       1,
	}

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorOctoWoW}
	ApplySpells(flavor, []*chrondbc.Spell{cast, aura})

	require.Equal(t, int32(1), cast.DurationIndex_)
	require.Equal(t, int32(10_000), cast.Duration.MaxDuration)
	require.Equal(t, int32(10_000), aura.Duration.MaxDuration)
	require.Equal(t, cast.Description_lang, aura.Description_lang)
	require.Equal(t, cast.SpellIcon, aura.SpellIcon)
	require.Equal(t, cast.SpellIconID_, aura.SpellIconID_)
	require.Equal(t, "Attack and casting speed increased.", aura.AuraDescription())
	require.True(t, IsAllClassCooldown(flavor, cast.ID))
	require.False(t, IsAllClassCooldown(database.WoWFlavor{database.FlavorWrath}, cast.ID))
}
