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
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestValidateSubjects(t *testing.T) {
	t.Parallel()
	character := guid.GUID(123)
	for _, test := range []struct {
		name    string
		subject Subject
		valid   bool
	}{
		{"guild missing ID", Subject{Type: "guild", Name: "My Guild"}, false},
		{"guild", Subject{Type: "guild", GuildID: uuid.NullUUID{UUID: uuid.New(), Valid: true}, Name: "My Guild"}, true},
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

func TestProofCooldownSerializesConcurrentTenants(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	svc := New(zed, objects)
	applicant := uuid.New()
	_, err = zed.InsertUser(ctx, database.InsertUserParams{ID: applicant, Username: "cooldown-" + applicant.String()[:8]})
	require.NoError(t, err)
	initial, err := svc.Cooldown(ctx, applicant, "character-link")
	require.NoError(t, err)
	require.Nil(t, initial)

	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var photo bytes.Buffer
	require.NoError(t, jpeg.Encode(&photo, img, nil))
	subjects := []Subject{{Type: "test", Name: "Example"}}
	type outcome struct {
		id  uuid.UUID
		err error
	}
	results := make(chan outcome, 2)
	start := make(chan struct{})
	for range 2 {
		tenantID := uuid.New()
		go func() {
			<-start
			requestCtx := servicetenant.WithTenantID(ctx, tenantID)
			id, err := svc.Create(requestCtx, tenantID, applicant, "character-link", "", photo.Bytes(), subjects)
			results <- outcome{id, err}
		}()
	}
	close(start)
	var created uuid.UUID
	for range 2 {
		result := <-results
		if result.err == nil {
			require.NotEqual(t, uuid.Nil, result.id)
			created = result.id
			continue
		}
		var cooldown *CooldownError
		require.ErrorAs(t, result.err, &cooldown)
		require.WithinDuration(t, time.Now().Add(24*time.Hour), cooldown.NextSubmissionAt, time.Minute)
	}
	require.NotEqual(t, uuid.Nil, created)
	rows, err := zed.ListAllProofRequests(servicetenant.AdminBypass(ctx))
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, created, rows[0].ID)
	next, err := svc.Cooldown(ctx, applicant, "character-link")
	require.NoError(t, err)
	require.NotNil(t, next)
	require.WithinDuration(t, rows[0].CreatedAt.Time.Add(24*time.Hour), *next, time.Second)
	independent, err := svc.Cooldown(ctx, applicant, "guild-ownership")
	require.NoError(t, err)
	require.Nil(t, independent)
}
