package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCritterState(t *testing.T) {
	t.Parallel()
	original := &Critter{NeverActive: characters.NewNeverActive(guid.GUID(123))}
	s, e := original.CaptureState()
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeCritterState(CritterStateVersion, b)
	require.NoError(t, e)
	restored := new(Critter)
	require.NoError(t, restored.RestoreState(s))
	require.Equal(t, original.ID(), restored.ID())
	require.False(t, restored.IsActive())
	_, e = DecodeCritterState(CritterStateVersion, []byte(`{}`))
	require.Error(t, e)
}
func TestDiscipleOfNaralexState(t *testing.T) {
	t.Parallel()
	original := &DiscipleOfNaralex{NeverActive: characters.NewNeverActive(guid.GUID(123))}
	s, e := original.CaptureState()
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeDiscipleOfNaralexState(DiscipleOfNaralexStateVersion, b)
	require.NoError(t, e)
	restored := new(DiscipleOfNaralex)
	require.NoError(t, restored.RestoreState(s))
	require.Equal(t, original.ID(), restored.ID())
	require.False(t, restored.IsActive())
	_, e = DecodeDiscipleOfNaralexState(DiscipleOfNaralexStateVersion, []byte(`{}`))
	require.Error(t, e)
}
func TestArugalState(t *testing.T) {
	t.Parallel()
	base := new(characters.Common)
	original := &archmageArugal{CharacterBase: base}
	s, e := original.CaptureState(func(characters.CharacterBase) (string, error) { return "base", nil })
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeArchmageArugalState(ArchmageArugalStateVersion, b)
	require.NoError(t, e)
	restored := InitArchmageArugal()
	require.NoError(t, restored.RestoreState(s, func(string) (characters.CharacterBase, error) { return base, nil }))
	require.Same(t, base, restored.CharacterBase)
	require.Error(t, restored.RestoreState(s, func(string) (characters.CharacterBase, error) { return (*characters.Common)(nil), nil }))
	require.Same(t, base, restored.CharacterBase)
}
