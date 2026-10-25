package serviceproof

import (
	"bytes"
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestValidateSubjects(t *testing.T) {
	t.Parallel()
	character := guid.GUID(123)
	for _, test := range []struct {
		name    string
		subject Subject
		valid   bool
	}{
		{"future guild", Subject{Type: "guild", Name: "My Guild"}, true},
		{"missing type", Subject{Name: "Unknown"}, false},
		{"character missing realm", Subject{Type: "character", CharacterGUID: &character}, false},
		{"character missing GUID", Subject{Type: "character", RealmID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}, false},
		{"character", Subject{Type: "character", RealmID: uuid.NullUUID{UUID: uuid.New(), Valid: true}, CharacterGUID: &character}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := validateSubjects([]Subject{test.subject}) == nil; got != test.valid {
				t.Errorf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}

func TestRejectMissingApprovalHandler(t *testing.T) {
	t.Parallel()
	service := New(nil, nil)
	if err := service.Decide(context.Background(), Scope{TenantID: uuid.New()}, uuid.New(), uuid.New(), "character-link", "", nil, nil); err == nil {
		t.Fatal("expected missing approval handler error")
	}
}

func TestValidateJPEG(t *testing.T) {
	t.Parallel()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name  string
		data  []byte
		valid bool
	}{
		{"valid JPEG", buf.Bytes(), true},
		{"fake header", []byte{0xff, 0xd8, 0xff, 0, 0, 0}, false},
		{"truncated", buf.Bytes()[:len(buf.Bytes())/2], false},
		{"oversized", make([]byte, MaxImage+1), false},
		{"empty", nil, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := ValidateJPEG(test.data) == nil; got != test.valid {
				t.Errorf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}
