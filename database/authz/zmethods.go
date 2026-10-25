package authz

import (
	"context"
	"fmt"
	"iter"
	"sort"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/consistency"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

type Authorizer interface {
	Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error)
	Delete(ctx context.Context, filter *rel.PreconditionedFilter) error
}

type DatabaseAuthorizer interface {
	Authorizer
	database.StoreQueries
}

func (z *Authz) DefaultConsistencyStrategy() *consistency.Strategy {
	if token := z.zedToken.Load(); token != nil {
		return consistency.AtLeast(*token)
	}
	return consistency.Full()
}

func (z *Authz) Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error) {
	token, err := z.spice.Write(ctx, txn)
	if err != nil {
		return "", err
	}

	z.zedToken.Store(&token)
	return token, nil
}

func (z *AuthzTX) Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error) {
	zed, err := z.parent.Write(ctx, txn)
	if err != nil {
		return zed, err
	}

	// Merge the transaction's relations into the AuthzTX's relations
	// These will be undone on a "revert"
	z.relations.V1Updates = append(z.relations.V1Updates, txn.V1Updates...)

	return zed, nil
}

func (z *Authz) Delete(ctx context.Context, filter *rel.PreconditionedFilter) error {
	token, err := z.spice.DeleteAtomic(ctx, filter)
	if err != nil {
		return err
	}
	z.zedToken.Store(&token)
	return nil
}

func (z *AuthzTX) Delete(ctx context.Context, filter *rel.PreconditionedFilter) error {
	return z.parent.Delete(ctx, filter)
}

func (z *Authz) CheckOne(ctx context.Context, cs *consistency.Strategy, rs rel.Interface) (bool, error) {
	if cs == nil {
		cs = z.DefaultConsistencyStrategy()
	}
	return z.spice.CheckOne(ctx, cs, rs)
}

// LookupResources returns an iterator of resource IDs where the given subject
// has the specified permission. permission is "type#relation" (e.g.
// "wow_server#administer"), subject is "type:id" (e.g. "user:<uuid>").
func (z *Authz) LookupResources(ctx context.Context, cs *consistency.Strategy, permission, subject string) iter.Seq2[string, error] {
	if cs == nil {
		cs = z.DefaultConsistencyStrategy()
	}
	return z.spice.LookupResources(ctx, cs, permission, subject)
}

func (z *Authz) Check(ctx context.Context, cs *consistency.Strategy, rs ...rel.Interface) ([]bool, error) {
	if cs == nil {
		cs = z.DefaultConsistencyStrategy()
	}
	return z.spice.Check(ctx, cs, rs...)
}

// UserChronicleRoles returns the relations/roles a user has on the chronicle singleton object.
// These are roles like "admin", "moderator", "upload_capable".
func (z *Authz) UserChronicleRoles(ctx context.Context, user uuid.UUID) ([]string, error) {
	usr := policy.New().User(user)

	// Filter for chronicle:chronicle with any relation
	f := rel.NewFilter("chronicle", "chronicle", "")
	f.WithSubjectFilter(usr.Object().Typ, usr.Object().ID, "")

	var roles []string
	for r, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), f) {
		if err != nil {
			return nil, err
		}
		// Check if this relationship's subject is our user
		//if r.SubjectType == usr.Object().ObjectType && r.SubjectID == usr.Object().ObjectId {
		roles = append(roles, r.ResourceRelation)
		//}
	}

	return roles, nil
}

// GuildRosterMember represents a user's roles in a guild from SpiceDB.
type GuildRosterMember struct {
	UserID uuid.UUID
	Roles  []string // "member", "leader", etc.
}

// GuildRosterMembers returns all users with member or leader relations to a guild.
func (z *Authz) GuildRosterMembers(ctx context.Context, guildID uuid.UUID) ([]GuildRosterMember, error) {
	f := rel.NewFilter("guild", guildID.String(), "")
	f.WithSubjectFilter("user", "", "")

	// Collect roles per user
	byUser := make(map[uuid.UUID][]string)
	for r, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), f) {
		if err != nil {
			return nil, err
		}
		if r.ResourceRelation != "member" && r.ResourceRelation != "leader" {
			continue
		}
		id, err := uuid.Parse(r.SubjectID)
		if err != nil {
			continue
		}
		byUser[id] = append(byUser[id], r.ResourceRelation)
	}

	members := make([]GuildRosterMember, 0, len(byUser))
	for userID, roles := range byUser {
		members = append(members, GuildRosterMember{
			UserID: userID,
			Roles:  roles,
		})
	}
	return members, nil
}

// AddGuildMember writes the member relation to SpiceDB only.
func (z *Authz) AddGuildMember(ctx context.Context, guildID, userID uuid.UUID) error {
	b := policy.New()
	g := b.Guild(guildID)
	g.Chronicle(b.GlobalChronicle())
	g.Member(b.User(userID))
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// RemoveGuildMember deletes all guild relations for a user from SpiceDB.
func (z *Authz) RemoveGuildMember(ctx context.Context, guildID, userID uuid.UUID) error {
	g := policy.New().Guild(guildID).Object()
	u := policy.New().User(userID).Object()
	f := rel.NewFilter(g.Typ, g.ID, "")
	f.WithSubjectFilter(u.Typ, u.ID, "")
	return z.Delete(ctx, rel.NewPreconditionedFilter(f))
}

// SetGuildMemberRole replaces all guild relations for a user with the given role.
// Valid roles: "member", "leader".
func (z *Authz) SetGuildMemberRole(ctx context.Context, guildID, userID uuid.UUID, role string) error {
	// First remove all existing relations for this user in the guild
	if err := z.RemoveGuildMember(ctx, guildID, userID); err != nil {
		return err
	}

	// Then add the new role
	b := policy.New()
	g := b.Guild(guildID)
	g.Chronicle(b.GlobalChronicle())
	u := b.User(userID)
	switch role {
	case "leader":
		g.Leader(u)
	case "member":
		g.Member(u)
	default:
		return fmt.Errorf("invalid role: %s", role)
	}
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// IsGuildMember checks if a user has a direct member or leader relation to a guild.
// This does NOT include site admins who have access via chronicle->admin_guilds.
func (z *Authz) IsGuildMember(ctx context.Context, guildID, userID uuid.UUID) (bool, error) {
	zg := policy.New().Guild(guildID)
	actor := policy.New().User(userID)
	return z.CheckOne(ctx, nil, zg.CanDirect_member_User(actor))
}

// IsGuildDiscordBotEnabled reports whether the guild has the wildcard Discord
// bot entitlement. The concrete subject ID is irrelevant because the relation
// only grants access through user:*.
func (z *Authz) IsGuildDiscordBotEnabled(ctx context.Context, guildID uuid.UUID) (bool, error) {
	guild := policy.New().Guild(guildID)
	return z.CheckOne(ctx, nil, guild.CanUse_discord_bot_User(policy.New().User(uuid.Nil)))
}

// SetGuildDiscordBotEnabled grants or revokes the guild's wildcard Discord bot
// entitlement. Callers are responsible for checking administer_authz.
func (z *Authz) SetGuildDiscordBotEnabled(ctx context.Context, guildID uuid.UUID, enabled bool) error {
	guild := policy.New().Guild(guildID)
	filter := rel.NewFilter(guild.Object().Typ, guild.Object().ID, "discord_bot_enabled")
	if err := z.Delete(ctx, rel.NewPreconditionedFilter(filter)); err != nil {
		return fmt.Errorf("delete Discord bot entitlement: %w", err)
	}
	if !enabled {
		return nil
	}

	builder := policy.New()
	builder.Guild(guildID).Discord_bot_enabledWildcard()
	_, err := z.Write(ctx, *builder.Txn())
	return err
}

// SetStripeEntitlementRole grants or revokes one Stripe-owned Chronicle role.
// It never modifies roles owned by Discord, administrators, or other systems.
func (z *Authz) SetStripeEntitlementRole(ctx context.Context, userID uuid.UUID, role string, granted bool) error {
	return setStripeEntitlementRole(ctx, z, userID, role, granted)
}

func (z *AuthzTX) SetStripeEntitlementRole(ctx context.Context, userID uuid.UUID, role string, granted bool) error {
	return setStripeEntitlementRole(ctx, z, userID, role, granted)
}

func setStripeEntitlementRole(ctx context.Context, authorizer Authorizer, userID uuid.UUID, role string, granted bool) error {
	b := policy.New()
	chronicle := b.GlobalChronicle()
	user := b.User(userID)
	if granted {
		switch role {
		case "stripe_ad_free":
			chronicle.Stripe_ad_free(user)
		case "stripe_download_raw_logs":
			chronicle.Stripe_download_raw_logs(user)
		case "stripe_unlisted_logs":
			chronicle.Stripe_unlisted_logs(user)
		default:
			return fmt.Errorf("invalid Stripe entitlement role %q", role)
		}
	} else {
		switch role {
		case "stripe_ad_free":
			chronicle.Delete().Stripe_ad_free(user)
		case "stripe_download_raw_logs":
			chronicle.Delete().Stripe_download_raw_logs(user)
		case "stripe_unlisted_logs":
			chronicle.Delete().Stripe_unlisted_logs(user)
		default:
			return fmt.Errorf("invalid Stripe entitlement role %q", role)
		}
	}
	_, err := authorizer.Write(ctx, *b.Txn())
	return err
}

// SetInferenceDisabled lets a user opt out of inference without changing the
// administrator-managed capability that makes inference available to them.
func (z *Authz) SetInferenceDisabled(ctx context.Context, userID uuid.UUID, disabled bool) error {
	b := policy.New()
	chronicle := b.GlobalChronicle()
	user := b.User(userID)
	if disabled {
		chronicle.Inference_disabled(user)
	} else {
		chronicle.Delete().Inference_disabled(user)
	}
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// SetUserChronicleRoles replaces the administrator-managed Chronicle roles for a user.
// Roles owned by Discord, billing, or other systems are left untouched.
func (z *Authz) SetUserChronicleRoles(ctx context.Context, userID uuid.UUID, roles []string) error {
	b := policy.New()
	gChron := b.GlobalChronicle()
	usr := b.User(userID)

	managedRelations := []string{
		"technical_admin",
		"admin",
		"upload_capable",
		"unlisted_log_capable",
		"ad_free_capable",
		"inference_capable",
		"inference_debug_capable",
		"moderate_logs",
		"moderate_guilds",
		"is_admin_users",
		"photo_proof_submitter",
		"photo_proof_reviewer",
		"photo_proof_banned",
		"is_admin_queues",
		"is_admin_game_data",
		"manage_consumables",
		"is_admin_raid_requirements",
	}
	for _, relation := range managedRelations {
		f := rel.NewFilter(gChron.Object().Typ, gChron.Object().ID, relation)
		f.WithSubjectFilter(usr.Object().Typ, usr.Object().ID, "")
		if err := z.Delete(ctx, rel.NewPreconditionedFilter(f)); err != nil {
			return fmt.Errorf("delete existing %s role: %w", relation, err)
		}
	}

	// Re-create builder after deletes (fresh txn). The baseline member role is
	// always restored, even when the requested optional role set is empty.
	b = policy.New()
	gChron = b.GlobalChronicle()
	usr = b.User(userID)

	gChron.Chronicle_member(usr)
	for _, role := range roles {
		switch role {
		case "technical_admin":
			gChron.Technical_admin(usr)
		case "admin":
			gChron.Admin(usr)
		case "upload_capable":
			gChron.Upload_capable(usr)
		case "unlisted_log_capable":
			gChron.Unlisted_log_capable(usr)
		case "ad_free_capable":
			gChron.Ad_free_capable(usr)
		case "inference_capable":
			gChron.Inference_capable(usr)
		case "inference_debug_capable":
			gChron.Inference_debug_capable(usr)
		case "moderate_logs":
			gChron.Moderate_logs(usr)
		case "moderate_guilds":
			gChron.Moderate_guilds(usr)
		case "admin_users", "is_admin_users":
			gChron.Is_admin_users(usr)
		case "photo_proof_submitter":
			gChron.Photo_proof_submitter(usr)
		case "photo_proof_reviewer":
			gChron.Photo_proof_reviewer(usr)
		case "photo_proof_banned":
			gChron.Photo_proof_banned(usr)
		case "admin_queues", "is_admin_queues":
			gChron.Is_admin_queues(usr)
		case "admin_game_data", "is_admin_game_data":
			gChron.Is_admin_game_data(usr)
		case "manage_consumables":
			gChron.Manage_consumables(usr)
		case "admin_raid_requirements", "is_admin_raid_requirements":
			gChron.Is_admin_raid_requirements(usr)
		default:
			continue
		}
	}

	_, err := z.Write(ctx, *b.Txn())
	return err
}

// TenantProofGrant lists direct tenant-scoped photo proof permissions. These
// relationships are not global Chronicle roles and are not inherited by tenant
// administrators.
type TenantProofGrant struct {
	UserID uuid.UUID
	Submit bool
	Review bool
}

func (z *Authz) TenantProofGrants(ctx context.Context, tenantID uuid.UUID) ([]TenantProofGrant, error) {
	grants := map[uuid.UUID]*TenantProofGrant{}
	for _, entry := range []struct {
		relation string
		review   bool
	}{
		{"photo_proof_submitter", false}, {"photo_proof_reviewer", true},
	} {
		filter := rel.NewFilter("wow_tenant", tenantID.String(), entry.relation)
		filter.WithSubjectFilter("user", "", "")
		for relation, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), filter) {
			if err != nil {
				return nil, err
			}
			id, err := uuid.Parse(relation.SubjectID)
			if err != nil {
				continue
			}
			grant := grants[id]
			if grant == nil {
				grant = &TenantProofGrant{UserID: id}
				grants[id] = grant
			}
			if entry.review {
				grant.Review = true
			} else {
				grant.Submit = true
			}
		}
	}
	result := make([]TenantProofGrant, 0, len(grants))
	for _, grant := range grants {
		result = append(result, *grant)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].UserID.String() < result[j].UserID.String() })
	return result, nil
}

// SetTenantProofGrant replaces both direct proof permissions for one user on
// one tenant. It does not affect the user's grants on other tenants.
func (z *Authz) SetTenantProofGrant(ctx context.Context, tenantID, userID uuid.UUID, submit, review bool) error {
	for _, relation := range []string{"photo_proof_submitter", "photo_proof_reviewer"} {
		filter := rel.NewFilter("wow_tenant", tenantID.String(), relation)
		filter.WithSubjectFilter("user", userID.String(), "")
		if err := z.Delete(ctx, rel.NewPreconditionedFilter(filter)); err != nil {
			return err
		}
	}
	b := policy.New()
	tenant := b.Wow_tenant(tenantID)
	user := b.User(userID)
	if submit {
		tenant.Photo_proof_submitter(user)
	}
	if review {
		tenant.Photo_proof_reviewer(user)
	}
	if !submit && !review {
		return nil
	}
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// UserTenantApplications returns all wow_tenant_application IDs where the user
// has the admin relation. This is a reverse lookup from user → applications.
func (z *Authz) UserTenantApplications(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	f := rel.NewFilter("wow_tenant_application", "", "admin")
	f.WithSubjectFilter("user", userID.String(), "")

	var appIDs []uuid.UUID
	for r, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), f) {
		if err != nil {
			return nil, err
		}
		id, err := uuid.Parse(r.ResourceID)
		if err != nil {
			continue
		}
		appIDs = append(appIDs, id)
	}
	return appIDs, nil
}

// TenantApplicationAdmins returns all user IDs that have the admin relation
// on the given wow_tenant_application resource.
func (z *Authz) TenantApplicationAdmins(ctx context.Context, applicationID uuid.UUID) ([]uuid.UUID, error) {
	f := rel.NewFilter("wow_tenant_application", applicationID.String(), "admin")
	f.WithSubjectFilter("user", "", "")

	var userIDs []uuid.UUID
	for r, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), f) {
		if err != nil {
			return nil, err
		}
		id, err := uuid.Parse(r.SubjectID)
		if err != nil {
			continue
		}
		userIDs = append(userIDs, id)
	}
	return userIDs, nil
}

// AddTenantApplicationAdmin writes the admin relation on a wow_tenant_application for a user.
func (z *Authz) AddTenantApplicationAdmin(ctx context.Context, applicationID, userID uuid.UUID) error {
	b := policy.New()
	b.Wow_tenant_application(applicationID).Admin(b.User(userID))
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// RemoveTenantApplicationAdmin removes the admin relation on a wow_tenant_application for a user.
func (z *Authz) RemoveTenantApplicationAdmin(ctx context.Context, applicationID, userID uuid.UUID) error {
	f := rel.NewFilter("wow_tenant_application", applicationID.String(), "admin")
	f.WithSubjectFilter("user", userID.String(), "")
	return z.Delete(ctx, rel.NewPreconditionedFilter(f))
}

// RaidCompPermission names a checkable raid_composition permission.
type RaidCompPermission string

const (
	RaidCompView          RaidCompPermission = "view"
	RaidCompEdit          RaidCompPermission = "edit"
	RaidCompDelete        RaidCompPermission = "delete"
	RaidCompManageSharing RaidCompPermission = "manage_sharing"
)

// CheckRaidComposition checks a permission on a raid composition for a user.
// Anonymous viewers pass uuid.Nil: the public_viewer wildcard matches any
// user subject, so public compositions stay viewable without an account.
func (z *Authz) CheckRaidComposition(ctx context.Context, compID, userID uuid.UUID, permission RaidCompPermission) (bool, error) {
	b := policy.New()
	comp := b.Raid_composition(compID)
	actor := b.User(userID)
	switch permission {
	case RaidCompView:
		return z.CheckOne(ctx, nil, comp.CanView_User(actor))
	case RaidCompEdit:
		return z.CheckOne(ctx, nil, comp.CanEdit_User(actor))
	case RaidCompDelete:
		return z.CheckOne(ctx, nil, comp.CanDelete_User(actor))
	case RaidCompManageSharing:
		return z.CheckOne(ctx, nil, comp.CanManage_sharing_User(actor))
	default:
		return false, fmt.Errorf("unknown raid composition permission %q", permission)
	}
}

// SetRaidCompositionSharing declaratively replaces a composition's sharing
// state: the public_viewer wildcard and the full set of editor grants.
func (z *Authz) SetRaidCompositionSharing(ctx context.Context, compID uuid.UUID, publicView bool, editors []uuid.UUID) error {
	obj := policy.New().Raid_composition(compID).Object()
	for _, relation := range []string{"editor", "public_viewer"} {
		f := rel.NewFilter(obj.Typ, obj.ID, relation)
		if err := z.Delete(ctx, rel.NewPreconditionedFilter(f)); err != nil {
			return fmt.Errorf("clear %s relations: %w", relation, err)
		}
	}

	if !publicView && len(editors) == 0 {
		return nil
	}

	b := policy.New()
	comp := b.Raid_composition(compID)
	if publicView {
		comp.Public_viewerWildcard()
	}
	for _, editor := range editors {
		comp.Editor(b.User(editor))
	}
	_, err := z.Write(ctx, *b.Txn())
	return err
}
