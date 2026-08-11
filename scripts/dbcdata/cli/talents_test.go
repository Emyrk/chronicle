package cli

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPetTalentMaskToIDs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mask int32
		want []int32
	}{
		{name: "none", mask: 0, want: nil},
		{name: "ferocity", mask: 1, want: []int32{1}},
		{name: "tenacity", mask: 2, want: []int32{2}},
		{name: "cunning", mask: 4, want: []int32{4}},
		{name: "shared", mask: 7, want: []int32{1, 2, 4}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, petTalentMaskToIDs(tt.mask))
		})
	}
}

func TestConvertToExportedTypesIncludesPets(t *testing.T) {
	t.Parallel()

	data := &talentTreeData{
		Classes: map[int32]classTalentData{
			3: {Tabs: []talentTabData{{ID: 1, Name: "Beast Mastery"}}},
		},
		Pets: map[int32]classTalentData{
			1: {Tabs: []talentTabData{{ID: 409, Name: "Ferocity"}}},
		},
	}

	got := convertToExportedTypes(data)
	require.Equal(t, "Beast Mastery", got.Classes[3].Tabs[0].Name)
	require.Equal(t, "Ferocity", got.Pets[1].Tabs[0].Name)

	encoded, err := json.Marshal(got)
	require.NoError(t, err)
	require.JSONEq(t, `{
		"classes":{"3":{"tabs":[{"id":1,"name":"Beast Mastery","backgroundFile":"","orderIndex":0,"spellIconID":0,"iconTexture":"","talents":null}]}},
		"pets":{"1":{"tabs":[{"id":409,"name":"Ferocity","backgroundFile":"","orderIndex":0,"spellIconID":0,"iconTexture":"","talents":null}]}}
	}`, string(encoded))
}
