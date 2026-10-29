package linkedapi

import (
	"bytes"
	"encoding/json"
	"image"
	"image/jpeg"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/serviceproof"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSubmitGuildProofRequiresLinkedGuildCharacter(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	h := &Handler{zed: zed, proofs: serviceproof.New(zed, objects)}

	serverID, realmID := uuid.New(), uuid.New()
	_, err = zed.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "claim-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = zed.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "claim-realm-" + realmID.String()})
	require.NoError(t, err)
	guild, err := zed.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Enigma", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)
	otherGuild, err := zed.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Other", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)

	newUser := func() uuid.UUID {
		id := uuid.New()
		_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: id, Username: "claim-" + id.String()[:8]})
		require.NoError(t, err)
		return id
	}
	var nextGUID uint64 = 0x200
	newPlayer := func(name string, guildID uuid.UUID) guid.GUID {
		nextGUID++
		g := guid.GUID(nextGUID)
		res := zed.UpsertPlayers(ctx, []database.UpsertPlayersParams{{
			ID: g, RealmID: realmID, Name: name, GuildID: uuid.NullUUID{UUID: guildID, Valid: true},
			Class: database.WowPlayableClassROGUE, Gender: database.WowPlayableGenderMale, Race: database.WowPlayableRaceGnome,
			Level: 60, UpdatedAt: database.Timestamptz(time.Now()),
		}})
		require.NoError(t, res.Close())
		return g
	}
	link := func(user uuid.UUID, character guid.GUID) {
		_, err := zed.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{UserID: user, CharacterGuid: character, RealmID: realmID, LinkSource: "manual"})
		require.NoError(t, err)
	}

	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var photo bytes.Buffer
	require.NoError(t, jpeg.Encode(&photo, img, nil))
	submit := func(applicant uuid.UUID, characterGUID string) *httptest.ResponseRecorder {
		var body bytes.Buffer
		form := multipart.NewWriter(&body)
		require.NoError(t, form.WriteField("guild_id", guild.ID.String()))
		require.NoError(t, form.WriteField("character_guid", characterGUID))
		part, err := form.CreateFormFile("photo", "roster.jpg")
		require.NoError(t, err)
		_, err = part.Write(photo.Bytes())
		require.NoError(t, err)
		require.NoError(t, form.Close())
		req := httptest.NewRequest(http.MethodPost, "/guild-proofs", &body)
		req.Header.Set("Content-Type", form.FormDataContentType())
		req = req.WithContext(chronauth.WithClaims(ctx, &claims.Claims{Subject: applicant}))
		rec := httptest.NewRecorder()
		h.SubmitGuildProof(rec, req)
		return rec
	}

	applicant, someoneElse := newUser(), newUser()
	unlinked := newPlayer("Unlinked", guild.ID)
	othersCharacter := newPlayer("Theirs", guild.ID)
	link(someoneElse, othersCharacter)
	wrongGuild := newPlayer("Elsewhere", otherGuild.ID)
	link(applicant, wrongGuild)
	leader := newPlayer("Janitor", guild.ID)
	link(applicant, leader)

	for _, tc := range []struct {
		name      string
		character string
		message   string
	}{
		{"missing character", "", "Select the character that leads this guild"},
		{"not linked", unlinked.String(), "Link Unlinked to your account before claiming this guild"},
		{"linked to someone else", othersCharacter.String(), "Link Theirs to your account before claiming this guild"},
		{"not in guild", wrongGuild.String(), "That character is not in this guild's armory roster"},
	} {
		rec := submit(applicant, tc.character)
		require.Equal(t, http.StatusBadRequest, rec.Code, tc.name)
		require.Contains(t, rec.Body.String(), tc.message, tc.name)
	}

	rec := submit(applicant, leader.String())
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var proof chroniclesdk.ProofRequest
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &proof))
	require.Len(t, proof.Subjects, 1)
	require.Equal(t, guild.ID, *proof.Subjects[0].GuildID)
	require.Equal(t, leader, proof.Subjects[0].CharacterGUID)
	require.Equal(t, "Janitor", proof.Subjects[0].CharacterName)
}
