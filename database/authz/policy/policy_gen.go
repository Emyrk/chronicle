// Package policy code generated. DO NOT EDIT.
package policy

import (
	"fmt"

	//nolint:staticcheck
	. "github.com/Emyrk/zedgen/relbuilder"
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/gochugaru/rel"
)

// SchemaBuilder is the entry point for building relationships and permission checks.
// It embeds relbuilder.Build for access to Updates() and Preconditions().
type SchemaBuilder struct {
	*Build
}

// New creates a new SchemaBuilder instance.
func New() *SchemaBuilder {
	return &SchemaBuilder{
		Build: NewBuild(),
	}
}

type ObjArmory_player struct {
	src Object
}

func (b *SchemaBuilder) Armory_player(id fmt.Stringer) *ObjArmory_player {
	return &ObjArmory_player{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "armory_player",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjArmory_player) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjArmory_player) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjArmory_player) RelationChronicle() string {
	return "chronicle"
}

type Armory_playerRelates struct {
	obj *ObjArmory_player
	rel Relationship
}

func (obj *ObjArmory_player) Touch() *Armory_playerRelates {
	return &Armory_playerRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjArmory_player) Delete() *Armory_playerRelates {
	return &Armory_playerRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjArmory_player) Create() *Armory_playerRelates {
	return &Armory_playerRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:68
// Relationship: armory_player:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjArmory_player) Chronicle(subs ...*ObjChronicle) *ObjArmory_player {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Armory_playerRelates) Chronicle(subs ...*ObjChronicle) *Armory_playerRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

type ObjChronicle struct {
	src Object
}

func (b *SchemaBuilder) Chronicle(id fmt.Stringer) *ObjChronicle {
	return &ObjChronicle{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "chronicle",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjChronicle) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjChronicle) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjChronicle) RelationAdmin() string {
	return "admin"
}

func (obj *ObjChronicle) RelationChronicle_guild_member() string {
	return "chronicle_guild_member"
}

func (obj *ObjChronicle) RelationChronicle_member() string {
	return "chronicle_member"
}

func (obj *ObjChronicle) RelationSupporter() string {
	return "supporter"
}

func (obj *ObjChronicle) RelationTechnical_admin() string {
	return "technical_admin"
}

func (obj *ObjChronicle) RelationTechnical_user() string {
	return "technical_user"
}

func (obj *ObjChronicle) RelationUpload_capable() string {
	return "upload_capable"
}

func (obj *ObjChronicle) PermissionCan_reparse() string {
	return "can_reparse"
}

func (obj *ObjChronicle) PermissionAdminister() string {
	return "administer"
}

func (obj *ObjChronicle) PermissionAdminister_authz() string {
	return "administer_authz"
}

func (obj *ObjChronicle) PermissionAdmin_logs() string {
	return "admin_logs"
}

func (obj *ObjChronicle) PermissionAdmin_layouts() string {
	return "admin_layouts"
}

func (obj *ObjChronicle) PermissionAdmin_guilds() string {
	return "admin_guilds"
}

func (obj *ObjChronicle) PermissionAdmin_users() string {
	return "admin_users"
}

func (obj *ObjChronicle) PermissionAdmin_queues() string {
	return "admin_queues"
}

func (obj *ObjChronicle) PermissionSet_user_data_limit() string {
	return "set_user_data_limit"
}

func (obj *ObjChronicle) PermissionShorter_urls() string {
	return "shorter_urls"
}

func (obj *ObjChronicle) PermissionInternal_game_data() string {
	return "internal_game_data"
}

func (obj *ObjChronicle) PermissionAdmin_regressions() string {
	return "admin_regressions"
}

func (obj *ObjChronicle) PermissionAdmin_speedrun_requirements() string {
	return "admin_speedrun_requirements"
}

func (obj *ObjChronicle) PermissionUpload_log() string {
	return "upload_log"
}

func (obj *ObjChronicle) PermissionCreate_layout() string {
	return "create_layout"
}

func (obj *ObjChronicle) PermissionAdmin_world_data() string {
	return "admin_world_data"
}

type ChronicleRelates struct {
	obj *ObjChronicle
	rel Relationship
}

func (obj *ObjChronicle) Touch() *ChronicleRelates {
	return &ChronicleRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjChronicle) Delete() *ChronicleRelates {
	return &ChronicleRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjChronicle) Create() *ChronicleRelates {
	return &ChronicleRelates{obj: obj, rel: obj.src.Create()}
}

// Technical_admin schema.zed:11
// Relationship: chronicle:<id>#technical_admin@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Technical_admin() etc.
func (obj *ObjChronicle) Technical_admin(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("technical_admin", sub.src.Obj, "")
	}
	return obj
}

// Technical_admin on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Technical_admin(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("technical_admin", sub.src.Obj, "")
	}
	return r
}

// Admin schema.zed:12
// Relationship: chronicle:<id>#admin@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Admin() etc.
func (obj *ObjChronicle) Admin(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("admin", sub.src.Obj, "")
	}
	return obj
}

// Admin on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Admin(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("admin", sub.src.Obj, "")
	}
	return r
}

// Upload_capable schema.zed:13
// Relationship: chronicle:<id>#upload_capable@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Upload_capable() etc.
func (obj *ObjChronicle) Upload_capable(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("upload_capable", sub.src.Obj, "")
	}
	return obj
}

// Upload_capable on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Upload_capable(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("upload_capable", sub.src.Obj, "")
	}
	return r
}

// Technical_user schema.zed:14
// Relationship: chronicle:<id>#technical_user@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Technical_user() etc.
func (obj *ObjChronicle) Technical_user(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("technical_user", sub.src.Obj, "")
	}
	return obj
}

// Technical_user on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Technical_user(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("technical_user", sub.src.Obj, "")
	}
	return r
}

// Supporter schema.zed:15
// Relationship: chronicle:<id>#supporter@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Supporter() etc.
func (obj *ObjChronicle) Supporter(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("supporter", sub.src.Obj, "")
	}
	return obj
}

// Supporter on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Supporter(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("supporter", sub.src.Obj, "")
	}
	return r
}

// Chronicle_guild_member schema.zed:16
// Relationship: chronicle:<id>#chronicle_guild_member@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle_guild_member() etc.
func (obj *ObjChronicle) Chronicle_guild_member(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle_guild_member", sub.src.Obj, "")
	}
	return obj
}

// Chronicle_guild_member on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Chronicle_guild_member(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle_guild_member", sub.src.Obj, "")
	}
	return r
}

// Chronicle_member schema.zed:17
// Relationship: chronicle:<id>#chronicle_member@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle_member() etc.
func (obj *ObjChronicle) Chronicle_member(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle_member", sub.src.Obj, "")
	}
	return obj
}

// Chronicle_member on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Chronicle_member(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle_member", sub.src.Obj, "")
	}
	return r
}

// CanCan_reparse_User checks if the subject has can_reparse permission
// // Object: chronicle:<id>
// Schema: permission can_reparse = technical_user
func (obj *ObjChronicle) CanCan_reparse_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "can_reparse",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdminister_User checks if the subject has administer permission
// // Object: chronicle:<id>
// Schema: permission administer = admin + technical_admin
func (obj *ObjChronicle) CanAdminister_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "administer",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdminister_authz_User checks if the subject has administer_authz permission
// // Object: chronicle:<id>
// Schema: permission administer_authz = technical_admin
func (obj *ObjChronicle) CanAdminister_authz_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "administer_authz",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_logs_User checks if the subject has admin_logs permission
// // Object: chronicle:<id>
// Schema: permission admin_logs = administer
func (obj *ObjChronicle) CanAdmin_logs_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_logs",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_layouts_User checks if the subject has admin_layouts permission
// // Object: chronicle:<id>
// Schema: permission admin_layouts = administer
func (obj *ObjChronicle) CanAdmin_layouts_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_layouts",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_guilds_User checks if the subject has admin_guilds permission
// // Object: chronicle:<id>
// Schema: permission admin_guilds = administer
func (obj *ObjChronicle) CanAdmin_guilds_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_guilds",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_users_User checks if the subject has admin_users permission
// // Object: chronicle:<id>
// Schema: permission admin_users = administer
func (obj *ObjChronicle) CanAdmin_users_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_users",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_queues_User checks if the subject has admin_queues permission
// // Object: chronicle:<id>
// Schema: permission admin_queues = technical_admin
func (obj *ObjChronicle) CanAdmin_queues_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_queues",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanSet_user_data_limit_User checks if the subject has set_user_data_limit permission
// // Object: chronicle:<id>
// Schema: permission set_user_data_limit = technical_admin
func (obj *ObjChronicle) CanSet_user_data_limit_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "set_user_data_limit",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanShorter_urls_User checks if the subject has shorter_urls permission
// // Object: chronicle:<id>
// Schema: permission shorter_urls = supporter + admin
func (obj *ObjChronicle) CanShorter_urls_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "shorter_urls",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanInternal_game_data_User checks if the subject has internal_game_data permission
// // Object: chronicle:<id>
// Schema: permission internal_game_data = technical_admin + administer + supporter
func (obj *ObjChronicle) CanInternal_game_data_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "internal_game_data",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_regressions_User checks if the subject has admin_regressions permission
// // Object: chronicle:<id>
// Schema: permission admin_regressions = technical_admin
func (obj *ObjChronicle) CanAdmin_regressions_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_regressions",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_speedrun_requirements_User checks if the subject has admin_speedrun_requirements permission
// // Object: chronicle:<id>
// Schema: permission admin_speedrun_requirements = technical_admin
func (obj *ObjChronicle) CanAdmin_speedrun_requirements_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_speedrun_requirements",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUpload_log_User checks if the subject has upload_log permission
// // Object: chronicle:<id>
// Schema: permission upload_log = upload_capable + administer + supporter + chronicle_guild_member + chronicle_member
func (obj *ObjChronicle) CanUpload_log_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "upload_log",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanCreate_layout_User checks if the subject has create_layout permission
// // Object: chronicle:<id>
// Schema: permission create_layout = chronicle_guild_member + chronicle_member
func (obj *ObjChronicle) CanCreate_layout_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "create_layout",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_world_data_User checks if the subject has admin_world_data permission
// // Object: chronicle:<id>
// Schema: permission admin_world_data = technical_admin
func (obj *ObjChronicle) CanAdmin_world_data_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_world_data",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjGuild struct {
	src Object
}

func (b *SchemaBuilder) Guild(id fmt.Stringer) *ObjGuild {
	return &ObjGuild{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "guild",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjGuild) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjGuild) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjGuild) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjGuild) RelationLeader() string {
	return "leader"
}

func (obj *ObjGuild) RelationMember() string {
	return "member"
}

func (obj *ObjGuild) PermissionDirect_member() string {
	return "direct_member"
}

func (obj *ObjGuild) PermissionManage_role_leader() string {
	return "manage_role_leader"
}

func (obj *ObjGuild) PermissionAdmin_guild() string {
	return "admin_guild"
}

func (obj *ObjGuild) PermissionAdd_member() string {
	return "add_member"
}

func (obj *ObjGuild) PermissionView_chronicle_roster() string {
	return "view_chronicle_roster"
}

type GuildRelates struct {
	obj *ObjGuild
	rel Relationship
}

func (obj *ObjGuild) Touch() *GuildRelates {
	return &GuildRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjGuild) Delete() *GuildRelates {
	return &GuildRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjGuild) Create() *GuildRelates {
	return &GuildRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:53
// Relationship: guild:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjGuild) Chronicle(subs ...*ObjChronicle) *ObjGuild {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *GuildRelates) Chronicle(subs ...*ObjChronicle) *GuildRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Leader schema.zed:55
// Relationship: guild:<id>#leader@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Leader() etc.
func (obj *ObjGuild) Leader(subs ...*ObjUser) *ObjGuild {
	for _, sub := range subs {
		obj.src.Touch().Add("leader", sub.src.Obj, "")
	}
	return obj
}

// Leader on Relates uses the specified operation (Touch/Create/Delete)
func (r *GuildRelates) Leader(subs ...*ObjUser) *GuildRelates {
	for _, sub := range subs {
		r.rel.Add("leader", sub.src.Obj, "")
	}
	return r
}

// Member schema.zed:56
// Relationship: guild:<id>#member@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Member() etc.
func (obj *ObjGuild) Member(subs ...*ObjUser) *ObjGuild {
	for _, sub := range subs {
		obj.src.Touch().Add("member", sub.src.Obj, "")
	}
	return obj
}

// Member on Relates uses the specified operation (Touch/Create/Delete)
func (r *GuildRelates) Member(subs ...*ObjUser) *GuildRelates {
	for _, sub := range subs {
		r.rel.Add("member", sub.src.Obj, "")
	}
	return r
}

// CanDirect_member_Chronicle checks if the subject has direct_member permission
// // Object: guild:<id>
// Schema: permission direct_member = member + leader
func (obj *ObjGuild) CanDirect_member_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "direct_member",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDirect_member_User checks if the subject has direct_member permission
// // Object: guild:<id>
// Schema: permission direct_member = member + leader
func (obj *ObjGuild) CanDirect_member_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "direct_member",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_role_leader_Chronicle checks if the subject has manage_role_leader permission
// // Object: guild:<id>
func (obj *ObjGuild) CanManage_role_leader_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_role_leader",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_role_leader_User checks if the subject has manage_role_leader permission
// // Object: guild:<id>
func (obj *ObjGuild) CanManage_role_leader_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_role_leader",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_guild_Chronicle checks if the subject has admin_guild permission
// // Object: guild:<id>
// Schema: permission admin_guild = leader + chronicle->admin_guilds
func (obj *ObjGuild) CanAdmin_guild_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_guild",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_guild_User checks if the subject has admin_guild permission
// // Object: guild:<id>
// Schema: permission admin_guild = leader + chronicle->admin_guilds
func (obj *ObjGuild) CanAdmin_guild_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_guild",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdd_member_Chronicle checks if the subject has add_member permission
// // Object: guild:<id>
// Schema: permission add_member = leader + chronicle->admin_guilds
func (obj *ObjGuild) CanAdd_member_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "add_member",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdd_member_User checks if the subject has add_member permission
// // Object: guild:<id>
// Schema: permission add_member = leader + chronicle->admin_guilds
func (obj *ObjGuild) CanAdd_member_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "add_member",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanView_chronicle_roster_Chronicle checks if the subject has view_chronicle_roster permission
// // Object: guild:<id>
// Schema: permission view_chronicle_roster = member + leader + chronicle->admin_guilds
func (obj *ObjGuild) CanView_chronicle_roster_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "view_chronicle_roster",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanView_chronicle_roster_User checks if the subject has view_chronicle_roster permission
// // Object: guild:<id>
// Schema: permission view_chronicle_roster = member + leader + chronicle->admin_guilds
func (obj *ObjGuild) CanView_chronicle_roster_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "view_chronicle_roster",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjInstance struct {
	src Object
}

func (b *SchemaBuilder) Instance(id fmt.Stringer) *ObjInstance {
	return &ObjInstance{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "instance",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjInstance) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjInstance) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjInstance) RelationPublic() string {
	return "public"
}

func (obj *ObjInstance) RelationRaid_log() string {
	return "raid_log"
}

func (obj *ObjInstance) PermissionView() string {
	return "view"
}

func (obj *ObjInstance) PermissionUpload_youtube() string {
	return "upload_youtube"
}

type InstanceRelates struct {
	obj *ObjInstance
	rel Relationship
}

func (obj *ObjInstance) Touch() *InstanceRelates {
	return &InstanceRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjInstance) Delete() *InstanceRelates {
	return &InstanceRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjInstance) Create() *InstanceRelates {
	return &InstanceRelates{obj: obj, rel: obj.src.Create()}
}

// Raid_log schema.zed:86
// Relationship: instance:<id>#raid_log@raid_log:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Raid_log() etc.
func (obj *ObjInstance) Raid_log(subs ...*ObjRaid_log) *ObjInstance {
	for _, sub := range subs {
		obj.src.Touch().Add("raid_log", sub.src.Obj, "")
	}
	return obj
}

// Raid_log on Relates uses the specified operation (Touch/Create/Delete)
func (r *InstanceRelates) Raid_log(subs ...*ObjRaid_log) *InstanceRelates {
	for _, sub := range subs {
		r.rel.Add("raid_log", sub.src.Obj, "")
	}
	return r
}

// PublicWildcard schema.zed:87
// Relationship: instance:<id>#public@user:*
func (obj *ObjInstance) PublicWildcard() *ObjInstance {
	obj.src.Touch().Add("public", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return obj
}

// PublicWildcard on Relates uses the specified operation
func (r *InstanceRelates) PublicWildcard() *InstanceRelates {
	r.rel.Add("public", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return r
}

// CanView_Raid_log checks if the subject has view permission
// // Object: instance:<id>
func (obj *ObjInstance) CanView_Raid_log(sub *ObjRaid_log) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "view",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUpload_youtube_Raid_log checks if the subject has upload_youtube permission
// // Object: instance:<id>
// Schema: permission upload_youtube = raid_log->upload_youtube
func (obj *ObjInstance) CanUpload_youtube_Raid_log(sub *ObjRaid_log) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "upload_youtube",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjLayout struct {
	src Object
}

func (b *SchemaBuilder) Layout(id fmt.Stringer) *ObjLayout {
	return &ObjLayout{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "layout",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjLayout) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjLayout) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjLayout) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjLayout) RelationOwner() string {
	return "owner"
}

func (obj *ObjLayout) PermissionDelete() string {
	return "delete"
}

func (obj *ObjLayout) PermissionEdit() string {
	return "edit"
}

type LayoutRelates struct {
	obj *ObjLayout
	rel Relationship
}

func (obj *ObjLayout) Touch() *LayoutRelates {
	return &LayoutRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjLayout) Delete() *LayoutRelates {
	return &LayoutRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjLayout) Create() *LayoutRelates {
	return &LayoutRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:39
// Relationship: layout:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjLayout) Chronicle(subs ...*ObjChronicle) *ObjLayout {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *LayoutRelates) Chronicle(subs ...*ObjChronicle) *LayoutRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Owner schema.zed:40
// Relationship: layout:<id>#owner@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Owner() etc.
func (obj *ObjLayout) Owner(subs ...*ObjUser) *ObjLayout {
	for _, sub := range subs {
		obj.src.Touch().Add("owner", sub.src.Obj, "")
	}
	return obj
}

// Owner on Relates uses the specified operation (Touch/Create/Delete)
func (r *LayoutRelates) Owner(subs ...*ObjUser) *LayoutRelates {
	for _, sub := range subs {
		r.rel.Add("owner", sub.src.Obj, "")
	}
	return r
}

// CanDelete_Chronicle checks if the subject has delete permission
// // Object: layout:<id>
// Schema: permission delete = owner + chronicle->admin_layouts
func (obj *ObjLayout) CanDelete_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "delete",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDelete_User checks if the subject has delete permission
// // Object: layout:<id>
// Schema: permission delete = owner + chronicle->admin_layouts
func (obj *ObjLayout) CanDelete_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "delete",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanEdit_Chronicle checks if the subject has edit permission
// // Object: layout:<id>
// Schema: permission edit = owner + chronicle->admin_layouts
func (obj *ObjLayout) CanEdit_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "edit",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanEdit_User checks if the subject has edit permission
// // Object: layout:<id>
// Schema: permission edit = owner + chronicle->admin_layouts
func (obj *ObjLayout) CanEdit_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "edit",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjRaid_log struct {
	src Object
}

func (b *SchemaBuilder) Raid_log(id fmt.Stringer) *ObjRaid_log {
	return &ObjRaid_log{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "raid_log",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjRaid_log) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjRaid_log) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjRaid_log) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjRaid_log) RelationUploader() string {
	return "uploader"
}

func (obj *ObjRaid_log) PermissionView() string {
	return "view"
}

func (obj *ObjRaid_log) PermissionReparse() string {
	return "reparse"
}

func (obj *ObjRaid_log) PermissionDelete_files() string {
	return "delete_files"
}

func (obj *ObjRaid_log) PermissionUpload_youtube() string {
	return "upload_youtube"
}

func (obj *ObjRaid_log) PermissionDelete() string {
	return "delete"
}

type Raid_logRelates struct {
	obj *ObjRaid_log
	rel Relationship
}

func (obj *ObjRaid_log) Touch() *Raid_logRelates {
	return &Raid_logRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjRaid_log) Delete() *Raid_logRelates {
	return &Raid_logRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjRaid_log) Create() *Raid_logRelates {
	return &Raid_logRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:72
// Relationship: raid_log:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjRaid_log) Chronicle(subs ...*ObjChronicle) *ObjRaid_log {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Raid_logRelates) Chronicle(subs ...*ObjChronicle) *Raid_logRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Uploader schema.zed:73
// Relationship: raid_log:<id>#uploader@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Uploader() etc.
func (obj *ObjRaid_log) Uploader(subs ...*ObjUser) *ObjRaid_log {
	for _, sub := range subs {
		obj.src.Touch().Add("uploader", sub.src.Obj, "")
	}
	return obj
}

// Uploader on Relates uses the specified operation (Touch/Create/Delete)
func (r *Raid_logRelates) Uploader(subs ...*ObjUser) *Raid_logRelates {
	for _, sub := range subs {
		r.rel.Add("uploader", sub.src.Obj, "")
	}
	return r
}

// CanView_Chronicle checks if the subject has view permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanView_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "view",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanView_User checks if the subject has view permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanView_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "view",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanReparse_Chronicle checks if the subject has reparse permission
// // Object: raid_log:<id>
// Schema: permission reparse = chronicle->admin_logs + (uploader & chronicle->can_reparse)
func (obj *ObjRaid_log) CanReparse_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "reparse",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanReparse_User checks if the subject has reparse permission
// // Object: raid_log:<id>
// Schema: permission reparse = chronicle->admin_logs + (uploader & chronicle->can_reparse)
func (obj *ObjRaid_log) CanReparse_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "reparse",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDelete_files_Chronicle checks if the subject has delete_files permission
// // Object: raid_log:<id>
// Schema: permission delete_files = uploader + chronicle->admin_logs
func (obj *ObjRaid_log) CanDelete_files_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "delete_files",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDelete_files_User checks if the subject has delete_files permission
// // Object: raid_log:<id>
// Schema: permission delete_files = uploader + chronicle->admin_logs
func (obj *ObjRaid_log) CanDelete_files_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "delete_files",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUpload_youtube_Chronicle checks if the subject has upload_youtube permission
// // Object: raid_log:<id>
// Schema: permission upload_youtube = uploader + chronicle->admin_logs
func (obj *ObjRaid_log) CanUpload_youtube_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "upload_youtube",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUpload_youtube_User checks if the subject has upload_youtube permission
// // Object: raid_log:<id>
// Schema: permission upload_youtube = uploader + chronicle->admin_logs
func (obj *ObjRaid_log) CanUpload_youtube_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "upload_youtube",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDelete_Chronicle checks if the subject has delete permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanDelete_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "delete",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDelete_User checks if the subject has delete permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanDelete_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "delete",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjRiver_queue struct {
	src Object
}

func (b *SchemaBuilder) River_queue(id fmt.Stringer) *ObjRiver_queue {
	return &ObjRiver_queue{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "river_queue",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjRiver_queue) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjRiver_queue) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjRiver_queue) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjRiver_queue) PermissionAccess() string {
	return "access"
}

type River_queueRelates struct {
	obj *ObjRiver_queue
	rel Relationship
}

func (obj *ObjRiver_queue) Touch() *River_queueRelates {
	return &River_queueRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjRiver_queue) Delete() *River_queueRelates {
	return &River_queueRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjRiver_queue) Create() *River_queueRelates {
	return &River_queueRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:47
// Relationship: river_queue:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjRiver_queue) Chronicle(subs ...*ObjChronicle) *ObjRiver_queue {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *River_queueRelates) Chronicle(subs ...*ObjChronicle) *River_queueRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// CanAccess_Chronicle checks if the subject has access permission
// // Object: river_queue:<id>
// Schema: permission access = chronicle->admin_queues
func (obj *ObjRiver_queue) CanAccess_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "access",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjUser struct {
	src Object
}

func (b *SchemaBuilder) User(id fmt.Stringer) *ObjUser {
	return &ObjUser{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "user",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjUser) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjUser) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}
