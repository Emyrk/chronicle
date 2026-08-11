package dbcdb

import (
	"testing"

	"github.com/Gophercraft/core/format/dbc/dbd"
	"github.com/Gophercraft/core/vsn"
	"github.com/stretchr/testify/require"
)

func TestRenameTalentTabPetMaskColumn(t *testing.T) {
	t.Parallel()

	def := &dbd.Definition{
		Layouts: []dbd.Layout{
			{
				BuildRanges: []vsn.BuildRange{vsn.Range(vsn.V3_0_2, vsn.V3_3_5a)},
				Columns: []dbd.LayoutColumn{
					{Name: "ClassMask"},
					{Name: "CategoryEnumID"},
				},
			},
			{
				BuildRanges: []vsn.BuildRange{vsn.Range(vsn.V4_0_1, vsn.V4_3_4)},
				Columns: []dbd.LayoutColumn{
					{Name: "ClassMask"},
					{Name: "CategoryEnumID"},
				},
			},
		},
	}

	require.True(t, renameTalentTabPetMaskColumn(def, vsn.V3_3_5a))
	require.NotNil(t, def.Layouts[0].Column("PetTalentMask"))
	require.Nil(t, def.Layouts[0].Column("CategoryEnumID"))
	require.NotNil(t, def.Layouts[1].Column("CategoryEnumID"))
	require.False(t, renameTalentTabPetMaskColumn(def, vsn.V3_3_5a))
}
