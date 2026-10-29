package linkedapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/serviceproof"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type proofNotificationQueue struct {
	args chroniclebot.ArgsNotifyAdmin
	err  error
}

func (q *proofNotificationQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.args = args.(chroniclebot.ArgsNotifyAdmin)
	return nil, q.err
}

func TestProofNotificationIsBestEffort(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	applicantID := uuid.New()
	_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: applicantID, Username: "applicant-" + applicantID.String()[:8]})
	require.NoError(t, err)
	bot, err := chroniclebot.New(ctx, testutil.Logger(t), chroniclebot.Config{Token: "test", AdminNotificationsChannelID: "review-channel"})
	require.NoError(t, err)
	queue := &proofNotificationQueue{err: errors.New("queue unavailable")}
	h := &Handler{zed: zed, bot: bot, queue: queue, accessURL: &url.URL{Scheme: "https", Host: "chronicle.example"}}
	requestID := uuid.New()
	subjects := []serviceproof.Subject{{Type: "character", Name: "Example", RealmName: "Realm"}}
	// A failed queue insertion has no error return to propagate to the applicant.
	h.notifyPhotoProof(ctx, requestID, applicantID, "Turtle", subjects)
	require.Equal(t, "New character-link photo proof", queue.args.Title)
	require.Contains(t, queue.args.Fields[0].Value, applicantID.String())
	require.Equal(t, "Turtle", queue.args.Fields[1].Value)
	require.Equal(t, "Example (Realm)", queue.args.Fields[2].Value)
	require.Equal(t, requestID.String(), queue.args.Fields[3].Value)
	require.Equal(t, "https://chronicle.example/admin/photo-proofs", queue.args.URL)
	require.Equal(t, "review-channel", queue.args.ChannelID)
	// Missing queue configuration is equally non-fatal.
	h.queue = nil
	h.notifyPhotoProof(ctx, requestID, applicantID, "Turtle", subjects)
}

type characterLinkDecisionQueue struct {
	args  chroniclebot.ArgsSendDiscordDM
	calls int
	err   error
}

func (q *characterLinkDecisionQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.calls++
	q.args = args.(chroniclebot.ArgsSendDiscordDM)
	return nil, q.err
}

type guildClaimDecisionQueue struct {
	args  chroniclebot.ArgsSendDiscordDM
	calls int
	err   error
}

func (q *guildClaimDecisionQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.calls++
	q.args = args.(chroniclebot.ArgsSendDiscordDM)
	return nil, q.err
}

func TestGuildClaimDecisionNotificationIsBestEffort(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	applicantID := uuid.New()
	_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: applicantID, Username: "guild-applicant-" + applicantID.String()[:8]})
	require.NoError(t, err)
	_, err = zed.InsertUserAuth(ctx, database.InsertUserAuthParams{ID: uuid.New(), UserID: applicantID, Provider: "discord", LinkedID: "discord-guild-applicant"})
	require.NoError(t, err)
	bot, err := chroniclebot.New(ctx, testutil.Logger(t), chroniclebot.Config{Token: "test", PrimaryDomain: "chronicle.example"})
	require.NoError(t, err)
	queue := &guildClaimDecisionQueue{err: errors.New("queue unavailable")}
	h := &Handler{zed: zed, bot: bot, queue: queue, accessURL: &url.URL{Scheme: "https", Host: "legacy.chronicle.example"}}
	guildID := uuid.New()
	proofID := uuid.New()
	h.notifyGuildClaimDecision(ctx, chroniclesdk.ProofRequest{
		ID: proofID, ApplicantID: applicantID, TenantID: uuid.New(), TenantName: "Turtle WoW", TenantSlug: "turtle", Status: "approved", Response: "Verified.",
		Subjects: []chroniclesdk.ProofSubject{{GuildID: &guildID, Name: "Claimed Guild", RealmName: "Realm", Status: "approved"}},
	})
	require.Equal(t, 1, queue.calls)
	require.Equal(t, "discord-guild-applicant", queue.args.DiscordID)
	require.Equal(t, proofID.String(), queue.args.UniqueKey)
	require.Len(t, queue.args.Message.Embeds, 1)
	embed := queue.args.Message.Embeds[0]
	require.Equal(t, "Guild page claimed", embed.Title)
	require.Equal(t, "https://turtle.chronicle.example/g/"+guildID.String(), embed.URL)
	require.Len(t, embed.Fields, 3)
	require.Equal(t, "Claimed Guild (Realm)", embed.Fields[0].Value)
	require.Equal(t, "Turtle WoW", embed.Fields[1].Value)
	require.Equal(t, "Verified.", embed.Fields[2].Value)
}

func TestCharacterLinkDecisionNotificationIsBestEffort(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	applicantID := uuid.New()
	_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: applicantID, Username: "applicant-" + applicantID.String()[:8]})
	require.NoError(t, err)
	_, err = zed.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID: uuid.New(), UserID: applicantID, Provider: "discord", LinkedID: "discord-applicant",
	})
	require.NoError(t, err)
	bot, err := chroniclebot.New(ctx, testutil.Logger(t), chroniclebot.Config{Token: "test", PrimaryDomain: "chronicle.example"})
	require.NoError(t, err)
	queue := &characterLinkDecisionQueue{err: errors.New("queue unavailable")}
	h := &Handler{zed: zed, bot: bot, queue: queue, accessURL: &url.URL{Scheme: "https", Host: "legacy.chronicle.example"}}

	proofID := uuid.New()
	h.notifyCharacterLinkDecision(ctx, chroniclesdk.ProofRequest{
		ID: proofID, ApplicantID: applicantID, TenantID: uuid.New(), TenantName: "Turtle WoW", TenantSlug: "turtle", Status: "partial", Response: "One photo was unclear.",
		Subjects: []chroniclesdk.ProofSubject{
			{Name: "Approved", RealmName: "Realm", Status: "approved"},
			{Name: "Rejected", RealmName: "Realm", Status: "rejected"},
		},
	})
	require.Equal(t, 1, queue.calls)
	require.Equal(t, proofID.String(), queue.args.UniqueKey)
	require.Equal(t, "discord-applicant", queue.args.DiscordID)
	require.Len(t, queue.args.Message.Embeds, 1)
	embed := queue.args.Message.Embeds[0]
	require.Equal(t, "Character link partially approved", embed.Title)
	require.Equal(t, "https://turtle.chronicle.example/account/characters", embed.URL)
	require.Len(t, embed.Fields, 4)
	require.Equal(t, "Turtle WoW", embed.Fields[0].Value)
	require.Equal(t, "Approved (Realm)", embed.Fields[1].Value)
	require.Equal(t, "Rejected (Realm)", embed.Fields[2].Value)
	require.Equal(t, "One photo was unclear.", embed.Fields[3].Value)

	// Missing URL configuration omits the link without skipping the DM.
	queue.err = nil
	h.accessURL = nil
	h.notifyCharacterLinkDecision(ctx, chroniclesdk.ProofRequest{
		ID: uuid.New(), ApplicantID: applicantID, Status: "rejected",
		Subjects: []chroniclesdk.ProofSubject{{Name: "Rejected", RealmName: "Realm", Status: "rejected"}},
	})
	require.Equal(t, 2, queue.calls)
	require.Len(t, queue.args.Message.Embeds, 1)
	embed = queue.args.Message.Embeds[0]
	require.Equal(t, "Character link rejected", embed.Title)
	require.Empty(t, embed.URL)
	require.Len(t, embed.Fields, 2)
	require.Equal(t, "Rejected (Realm)", embed.Fields[1].Value)

	// Accounts without linked Discord authentication are skipped.
	unlinkedApplicantID := uuid.New()
	_, err = zed.InsertUser(ctx, database.InsertUserParams{ID: unlinkedApplicantID, Username: "unlinked-" + unlinkedApplicantID.String()[:8]})
	require.NoError(t, err)
	h.notifyCharacterLinkDecision(ctx, chroniclesdk.ProofRequest{ID: uuid.New(), ApplicantID: unlinkedApplicantID, Status: "rejected"})
	require.Equal(t, 2, queue.calls)
}

func TestCharacterLinkDecisionURL(t *testing.T) {
	t.Parallel()
	accessURL := &url.URL{Scheme: "https", Host: "legacy.chronicle.example"}
	for _, tc := range []struct {
		name          string
		accessURL     *url.URL
		primaryDomain string
		proof         chroniclesdk.ProofRequest
		want          string
	}{
		{name: "main site", accessURL: accessURL, proof: chroniclesdk.ProofRequest{}, want: "https://legacy.chronicle.example/account/characters"},
		{name: "tenant site", accessURL: accessURL, primaryDomain: "chronicle.example", proof: chroniclesdk.ProofRequest{TenantID: uuid.New(), TenantSlug: "turtle"}, want: "https://turtle.chronicle.example/account/characters"},
		{name: "tenant slug unavailable", accessURL: accessURL, primaryDomain: "chronicle.example", proof: chroniclesdk.ProofRequest{TenantID: uuid.New()}},
		{name: "primary domain unavailable", accessURL: accessURL, proof: chroniclesdk.ProofRequest{TenantID: uuid.New(), TenantSlug: "turtle"}},
		{name: "access URL unavailable", primaryDomain: "chronicle.example", proof: chroniclesdk.ProofRequest{TenantID: uuid.New(), TenantSlug: "turtle"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			bot, err := chroniclebot.New(t.Context(), testutil.Logger(t), chroniclebot.Config{Token: "test", PrimaryDomain: tc.primaryDomain})
			require.NoError(t, err)
			h := &Handler{bot: bot, accessURL: tc.accessURL}
			require.Equal(t, tc.want, h.characterLinkDecisionURL(tc.proof))
		})
	}
}

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

func TestProofPermissionScopes(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	h := &Handler{zed: zed}
	tenantA, tenantB := uuid.New(), uuid.New()
	siteSubmitter, siteReviewer, tenantSubmitter, tenantReviewer, userAdmin, tenantAdmin, technicalAdmin := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteSubmitter, []string{"photo_proof_submitter"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteReviewer, []string{"photo_proof_reviewer"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userAdmin, []string{"is_admin_users"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, technicalAdmin, []string{"technical_admin"}))
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, tenantSubmitter, true, false))
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, tenantReviewer, false, true))
	b := policy.New()
	b.Wow_tenant(tenantA).Chronicle(b.GlobalChronicle()).Admin(b.User(tenantAdmin))
	b.Wow_tenant(tenantB).Chronicle(b.GlobalChronicle())
	_, err := zed.Write(ctx, *b.Txn())
	require.NoError(t, err)

	for _, tc := range []struct {
		name   string
		user   uuid.UUID
		tenant uuid.UUID // nil UUID means root domain
		review bool
		want   int
	}{
		{"site submit on tenant A", siteSubmitter, tenantA, false, http.StatusNoContent},
		{"site submit on tenant B", siteSubmitter, tenantB, false, http.StatusNoContent},
		{"site submit on root", siteSubmitter, uuid.Nil, false, http.StatusForbidden},
		{"tenant submit on A", tenantSubmitter, tenantA, false, http.StatusNoContent},
		{"tenant submit on B", tenantSubmitter, tenantB, false, http.StatusForbidden},
		{"site review on root", siteReviewer, uuid.Nil, true, http.StatusNoContent},
		{"site review on A", siteReviewer, tenantA, true, http.StatusNoContent},
		{"site review on B", siteReviewer, tenantB, true, http.StatusNoContent},
		{"tech admin review on root", technicalAdmin, uuid.Nil, true, http.StatusNoContent},
		{"tech admin review on A", technicalAdmin, tenantA, true, http.StatusNoContent},
		{"tech admin review on B", technicalAdmin, tenantB, true, http.StatusNoContent},
		{"tech admin submit on A", technicalAdmin, tenantA, false, http.StatusForbidden},
		{"tenant review on A", tenantReviewer, tenantA, true, http.StatusNoContent},
		{"tenant review on B", tenantReviewer, tenantB, true, http.StatusForbidden},
		{"tenant review on root", tenantReviewer, uuid.Nil, true, http.StatusForbidden},
		{"user admin on root", userAdmin, uuid.Nil, true, http.StatusNoContent},
		{"user admin on A", userAdmin, tenantA, true, http.StatusForbidden},
		{"tenant admin on A", tenantAdmin, tenantA, true, http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requestCtx := authz.AsUser(ctx, tc.user)
			if tc.tenant != uuid.Nil {
				requestCtx = servicetenant.WithTenantID(requestCtx, tc.tenant)
			}
			req := httptest.NewRequest(http.MethodGet, "/proofs", nil).WithContext(requestCtx)
			rec := httptest.NewRecorder()
			h.proofPermission(tc.review)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			})).ServeHTTP(rec, req)
			require.Equal(t, tc.want, rec.Code)
		})
	}

	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteSubmitter, []string{"photo_proof_submitter", "photo_proof_banned"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, tenantSubmitter, []string{"photo_proof_banned"}))
	for _, user := range []uuid.UUID{siteSubmitter, tenantSubmitter} {
		req := httptest.NewRequest(http.MethodPost, "/proofs", nil).WithContext(
			servicetenant.WithTenantID(authz.AsUser(ctx, user), tenantA),
		)
		rec := httptest.NewRecorder()
		h.proofPermission(false)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})).ServeHTTP(rec, req)
		require.Equal(t, http.StatusForbidden, rec.Code)
	}
}

func TestAdminProofsIncludeRootDomainRequests(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	h := &Handler{zed: zed, proofs: serviceproof.New(zed, objects)}
	applicant := uuid.New()
	_, err = zed.InsertUser(ctx, database.InsertUserParams{ID: applicant, Username: "root-" + applicant.String()[:8]})
	require.NoError(t, err)

	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var photo bytes.Buffer
	require.NoError(t, jpeg.Encode(&photo, img, nil))
	id, err := h.proofs.Create(ctx, uuid.Nil, applicant, "character-link", "", photo.Bytes(), []serviceproof.Subject{{Type: "test", Name: "Example"}})
	require.NoError(t, err)

	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	h.writeProofs(w, r, serviceproof.Scope{AllTenants: true}, []database.ProofRequest{{ID: id, ApplicantID: applicant}}, true)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var proofs []chroniclesdk.ProofRequest
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &proofs))
	require.Len(t, proofs, 1)
	require.Equal(t, "Main site", proofs[0].TenantName)
	require.NotNil(t, proofs[0].Applicant)
	require.Equal(t, "root-"+applicant.String()[:8], proofs[0].Applicant.Username)
	require.False(t, proofs[0].Applicant.DiscordLinked)
}

func TestGuildProofApprovalClaimsOnlyUnclaimedGuild(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	h := &Handler{zed: zed, proofs: serviceproof.New(zed, objects)}

	serverID, realmID := uuid.New(), uuid.New()
	_, err = zed.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "proof-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = zed.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "proof-realm-" + realmID.String()})
	require.NoError(t, err)
	guild, err := zed.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Claim Test Guild", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)
	reviewer := uuid.New()
	_, err = zed.InsertUser(ctx, database.InsertUserParams{ID: reviewer, Username: "reviewer-" + reviewer.String()[:8]})
	require.NoError(t, err)

	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var photo bytes.Buffer
	require.NoError(t, jpeg.Encode(&photo, img, nil))
	create := func(applicant uuid.UUID) (database.ProofRequest, []database.ProofRequestSubject) {
		_, createErr := zed.InsertUser(ctx, database.InsertUserParams{ID: applicant, Username: "claimant-" + applicant.String()[:8]})
		require.NoError(t, createErr)
		id, createErr := h.proofs.Create(ctx, uuid.Nil, applicant, guildOwnershipPurpose, "", photo.Bytes(), []serviceproof.Subject{{
			Type: "guild", GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true}, Name: guild.Name, RealmName: "Proof Realm",
		}})
		require.NoError(t, createErr)
		request, subjects, createErr := h.proofs.Get(ctx, serviceproof.Scope{TenantID: uuid.Nil}, id)
		require.NoError(t, createErr)
		return request, subjects
	}

	applicant := uuid.New()
	require.NoError(t, zed.AddGuildMember(ctx, guild.ID, applicant))
	request, subjects := create(applicant)
	approved := true
	err = h.decideGuildProof(ctx, serviceproof.Scope{TenantID: uuid.Nil}, request, subjects, reviewer, chroniclesdk.DecideProofRequest{
		Decisions: []chroniclesdk.ProofDecision{{GuildID: &guild.ID, Approved: approved}},
	})
	require.NoError(t, err)
	hasLeader, err := zed.GuildHasLeader(ctx, guild.ID)
	require.NoError(t, err)
	require.True(t, hasLeader)
	roster, err := zed.GuildRosterMembers(ctx, guild.ID)
	require.NoError(t, err)
	require.Len(t, roster, 1)
	require.Equal(t, applicant, roster[0].UserID)
	require.Equal(t, []string{"leader"}, roster[0].Roles)
	canEdit, err := zed.CheckOne(ctx, nil, policy.New().Guild(guild.ID).CanAdmin_guild_User(policy.New().User(applicant)))
	require.NoError(t, err)
	require.True(t, canEdit)

	secondApplicant := uuid.New()
	secondRequest, secondSubjects := create(secondApplicant)
	err = h.decideGuildProof(ctx, serviceproof.Scope{TenantID: uuid.Nil}, secondRequest, secondSubjects, reviewer, chroniclesdk.DecideProofRequest{
		Decisions: []chroniclesdk.ProofDecision{{GuildID: &guild.ID, Approved: true}},
	})
	require.ErrorIs(t, err, serviceproof.ErrConflict)
	secondCanEdit, err := zed.CheckOne(ctx, nil, policy.New().Guild(guild.ID).CanAdmin_guild_User(policy.New().User(secondApplicant)))
	require.NoError(t, err)
	require.False(t, secondCanEdit)
}
