package linkedapi

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
)

func TestValidProofCharacters(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	otherRealm := uuid.New()
	first := chroniclesdk.ProofCharacter{RealmID: realm, CharacterGUID: guid.GUID(1)}
	second := chroniclesdk.ProofCharacter{RealmID: realm, CharacterGUID: guid.GUID(2)}
	for _, test := range []struct {
		name       string
		characters []chroniclesdk.ProofCharacter
		valid      bool
	}{
		{"same realm", []chroniclesdk.ProofCharacter{first, second}, true},
		{"no characters", nil, false},
		{"other realm", []chroniclesdk.ProofCharacter{first, {RealmID: otherRealm, CharacterGUID: guid.GUID(2)}}, false},
		{"duplicate", []chroniclesdk.ProofCharacter{first, first}, false},
		{"missing GUID", []chroniclesdk.ProofCharacter{{RealmID: realm}}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := validProofCharacters(test.characters); got != test.valid {
				t.Errorf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}
