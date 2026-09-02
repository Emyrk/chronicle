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

func (obj *ObjArmory_player) RelationOwner() string {
	return "owner"
}

func (obj *ObjArmory_player) PermissionOwn() string {
	return "own"
}

func (obj *ObjArmory_player) PermissionManage_link() string {
	return "manage_link"
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

// Chronicle schema.zed:158
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

// Owner schema.zed:161
// Relationship: armory_player:<id>#owner@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Owner() etc.
func (obj *ObjArmory_player) Owner(subs ...*ObjUser) *ObjArmory_player {
	for _, sub := range subs {
		obj.src.Touch().Add("owner", sub.src.Obj, "")
	}
	return obj
}

// Owner on Relates uses the specified operation (Touch/Create/Delete)
func (r *Armory_playerRelates) Owner(subs ...*ObjUser) *Armory_playerRelates {
	for _, sub := range subs {
		r.rel.Add("owner", sub.src.Obj, "")
	}
	return r
}

// CanOwn_Chronicle checks if the subject has own permission
// // Object: armory_player:<id>
// Schema: permission own = owner
func (obj *ObjArmory_player) CanOwn_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "own",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanOwn_User checks if the subject has own permission
// // Object: armory_player:<id>
// Schema: permission own = owner
func (obj *ObjArmory_player) CanOwn_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "own",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_link_Chronicle checks if the subject has manage_link permission
// // Object: armory_player:<id>
// Schema: permission manage_link = owner + chronicle->admin_users
func (obj *ObjArmory_player) CanManage_link_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_link",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_link_User checks if the subject has manage_link permission
// // Object: armory_player:<id>
// Schema: permission manage_link = owner + chronicle->admin_users
func (obj *ObjArmory_player) CanManage_link_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_link",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
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

func (obj *ObjChronicle) RelationIs_admin_game_data() string {
	return "is_admin_game_data"
}

func (obj *ObjChronicle) RelationIs_admin_queues() string {
	return "is_admin_queues"
}

func (obj *ObjChronicle) RelationIs_admin_raid_requirements() string {
	return "is_admin_raid_requirements"
}

func (obj *ObjChronicle) RelationIs_admin_users() string {
	return "is_admin_users"
}

func (obj *ObjChronicle) RelationManage_consumables() string {
	return "manage_consumables"
}

func (obj *ObjChronicle) RelationModerate_guilds() string {
	return "moderate_guilds"
}

func (obj *ObjChronicle) RelationModerate_logs() string {
	return "moderate_logs"
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

func (obj *ObjChronicle) PermissionAdminister() string {
	return "administer"
}

func (obj *ObjChronicle) PermissionAdmin_logs() string {
	return "admin_logs"
}

func (obj *ObjChronicle) PermissionCan_reparse() string {
	return "can_reparse"
}

func (obj *ObjChronicle) PermissionAdminister_authz() string {
	return "administer_authz"
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

func (obj *ObjChronicle) PermissionAdmin_tenants() string {
	return "admin_tenants"
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

func (obj *ObjChronicle) PermissionAdmin_consumables() string {
	return "admin_consumables"
}

func (obj *ObjChronicle) PermissionAdmin_servers() string {
	return "admin_servers"
}

func (obj *ObjChronicle) PermissionCreate_tenant_application() string {
	return "create_tenant_application"
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

// Moderate_logs schema.zed:20
// Relationship: chronicle:<id>#moderate_logs@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Moderate_logs() etc.
func (obj *ObjChronicle) Moderate_logs(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("moderate_logs", sub.src.Obj, "")
	}
	return obj
}

// Moderate_logs on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Moderate_logs(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("moderate_logs", sub.src.Obj, "")
	}
	return r
}

// Moderate_guilds schema.zed:21
// Relationship: chronicle:<id>#moderate_guilds@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Moderate_guilds() etc.
func (obj *ObjChronicle) Moderate_guilds(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("moderate_guilds", sub.src.Obj, "")
	}
	return obj
}

// Moderate_guilds on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Moderate_guilds(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("moderate_guilds", sub.src.Obj, "")
	}
	return r
}

// Is_admin_users schema.zed:22
// Relationship: chronicle:<id>#is_admin_users@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Is_admin_users() etc.
func (obj *ObjChronicle) Is_admin_users(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("is_admin_users", sub.src.Obj, "")
	}
	return obj
}

// Is_admin_users on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Is_admin_users(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("is_admin_users", sub.src.Obj, "")
	}
	return r
}

// Is_admin_queues schema.zed:23
// Relationship: chronicle:<id>#is_admin_queues@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Is_admin_queues() etc.
func (obj *ObjChronicle) Is_admin_queues(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("is_admin_queues", sub.src.Obj, "")
	}
	return obj
}

// Is_admin_queues on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Is_admin_queues(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("is_admin_queues", sub.src.Obj, "")
	}
	return r
}

// Is_admin_game_data schema.zed:24
// Relationship: chronicle:<id>#is_admin_game_data@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Is_admin_game_data() etc.
func (obj *ObjChronicle) Is_admin_game_data(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("is_admin_game_data", sub.src.Obj, "")
	}
	return obj
}

// Is_admin_game_data on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Is_admin_game_data(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("is_admin_game_data", sub.src.Obj, "")
	}
	return r
}

// Manage_consumables schema.zed:25
// Relationship: chronicle:<id>#manage_consumables@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Manage_consumables() etc.
func (obj *ObjChronicle) Manage_consumables(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("manage_consumables", sub.src.Obj, "")
	}
	return obj
}

// Manage_consumables on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Manage_consumables(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("manage_consumables", sub.src.Obj, "")
	}
	return r
}

// Is_admin_raid_requirements schema.zed:26
// Relationship: chronicle:<id>#is_admin_raid_requirements@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Is_admin_raid_requirements() etc.
func (obj *ObjChronicle) Is_admin_raid_requirements(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("is_admin_raid_requirements", sub.src.Obj, "")
	}
	return obj
}

// Is_admin_raid_requirements on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Is_admin_raid_requirements(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("is_admin_raid_requirements", sub.src.Obj, "")
	}
	return r
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

// CanAdmin_logs_User checks if the subject has admin_logs permission
// // Object: chronicle:<id>
// Schema: permission admin_logs = administer + moderate_logs
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

// CanCan_reparse_User checks if the subject has can_reparse permission
// // Object: chronicle:<id>
// Schema: permission can_reparse = technical_user + moderate_logs
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
// Schema: permission admin_guilds = administer + moderate_guilds
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
// Schema: permission admin_users = administer + is_admin_users
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

// CanAdmin_tenants_User checks if the subject has admin_tenants permission
// // Object: chronicle:<id>
// Schema: permission admin_tenants = technical_admin
func (obj *ObjChronicle) CanAdmin_tenants_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_tenants",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_queues_User checks if the subject has admin_queues permission
// // Object: chronicle:<id>
// Schema: permission admin_queues = technical_admin + is_admin_queues
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

// CanAdmin_regressions_User checks if the subject has admin_regressions permission
// // Object: chronicle:<id>
// Schema: permission admin_regressions = technical_admin + is_admin_raid_requirements
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
// Schema: permission admin_speedrun_requirements = technical_admin + is_admin_raid_requirements
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
// Schema: permission admin_world_data = technical_admin + is_admin_game_data
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

// CanAdmin_consumables_User checks if the subject has admin_consumables permission
// // Object: chronicle:<id>
// Schema: permission admin_consumables = administer + manage_consumables
func (obj *ObjChronicle) CanAdmin_consumables_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_consumables",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanAdmin_servers_User checks if the subject has admin_servers permission
// // Object: chronicle:<id>
// Schema: permission admin_servers = technical_admin
func (obj *ObjChronicle) CanAdmin_servers_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "admin_servers",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanCreate_tenant_application_User checks if the subject has create_tenant_application permission
// // Object: chronicle:<id>
// Schema: permission create_tenant_application = technical_admin + chronicle_guild_member
func (obj *ObjChronicle) CanCreate_tenant_application_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "create_tenant_application",
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

func (obj *ObjGuild) RelationDiscord_bot_enabled() string {
	return "discord_bot_enabled"
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

func (obj *ObjGuild) PermissionUse_discord_bot() string {
	return "use_discord_bot"
}

func (obj *ObjGuild) PermissionManage_discord_bot() string {
	return "manage_discord_bot"
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

// Chronicle schema.zed:137
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

// Leader schema.zed:139
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

// Member schema.zed:140
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

// Discord_bot_enabledWildcard schema.zed:144
// Relationship: guild:<id>#discord_bot_enabled@user:*
func (obj *ObjGuild) Discord_bot_enabledWildcard() *ObjGuild {
	obj.src.Touch().Add("discord_bot_enabled", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return obj
}

// Discord_bot_enabledWildcard on Relates uses the specified operation
func (r *GuildRelates) Discord_bot_enabledWildcard() *GuildRelates {
	r.rel.Add("discord_bot_enabled", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
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

// CanUse_discord_bot_Chronicle checks if the subject has use_discord_bot permission
// // Object: guild:<id>
// Schema: permission use_discord_bot = discord_bot_enabled
func (obj *ObjGuild) CanUse_discord_bot_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "use_discord_bot",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUse_discord_bot_User checks if the subject has use_discord_bot permission
// // Object: guild:<id>
// Schema: permission use_discord_bot = discord_bot_enabled
func (obj *ObjGuild) CanUse_discord_bot_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "use_discord_bot",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_discord_bot_Chronicle checks if the subject has manage_discord_bot permission
// // Object: guild:<id>
// Schema: permission manage_discord_bot = admin_guild & discord_bot_enabled
func (obj *ObjGuild) CanManage_discord_bot_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_discord_bot",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_discord_bot_User checks if the subject has manage_discord_bot permission
// // Object: guild:<id>
// Schema: permission manage_discord_bot = admin_guild & discord_bot_enabled
func (obj *ObjGuild) CanManage_discord_bot_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_discord_bot",
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

// Raid_log schema.zed:182
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

// PublicWildcard schema.zed:183
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

// Chronicle schema.zed:96
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

// Owner schema.zed:97
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

type ObjRaid_composition struct {
	src Object
}

func (b *SchemaBuilder) Raid_composition(id fmt.Stringer) *ObjRaid_composition {
	return &ObjRaid_composition{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "raid_composition",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjRaid_composition) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjRaid_composition) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjRaid_composition) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjRaid_composition) RelationEditor() string {
	return "editor"
}

func (obj *ObjRaid_composition) RelationOwner() string {
	return "owner"
}

func (obj *ObjRaid_composition) RelationPublic_viewer() string {
	return "public_viewer"
}

func (obj *ObjRaid_composition) RelationViewer() string {
	return "viewer"
}

func (obj *ObjRaid_composition) PermissionView() string {
	return "view"
}

func (obj *ObjRaid_composition) PermissionEdit() string {
	return "edit"
}

func (obj *ObjRaid_composition) PermissionDelete() string {
	return "delete"
}

func (obj *ObjRaid_composition) PermissionManage_sharing() string {
	return "manage_sharing"
}

type Raid_compositionRelates struct {
	obj *ObjRaid_composition
	rel Relationship
}

func (obj *ObjRaid_composition) Touch() *Raid_compositionRelates {
	return &Raid_compositionRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjRaid_composition) Delete() *Raid_compositionRelates {
	return &Raid_compositionRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjRaid_composition) Create() *Raid_compositionRelates {
	return &Raid_compositionRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:118
// Relationship: raid_composition:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjRaid_composition) Chronicle(subs ...*ObjChronicle) *ObjRaid_composition {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Raid_compositionRelates) Chronicle(subs ...*ObjChronicle) *Raid_compositionRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Owner schema.zed:119
// Relationship: raid_composition:<id>#owner@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Owner() etc.
func (obj *ObjRaid_composition) Owner(subs ...*ObjUser) *ObjRaid_composition {
	for _, sub := range subs {
		obj.src.Touch().Add("owner", sub.src.Obj, "")
	}
	return obj
}

// Owner on Relates uses the specified operation (Touch/Create/Delete)
func (r *Raid_compositionRelates) Owner(subs ...*ObjUser) *Raid_compositionRelates {
	for _, sub := range subs {
		r.rel.Add("owner", sub.src.Obj, "")
	}
	return r
}

// Editor schema.zed:120
// Relationship: raid_composition:<id>#editor@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Editor() etc.
func (obj *ObjRaid_composition) Editor(subs ...*ObjUser) *ObjRaid_composition {
	for _, sub := range subs {
		obj.src.Touch().Add("editor", sub.src.Obj, "")
	}
	return obj
}

// Editor on Relates uses the specified operation (Touch/Create/Delete)
func (r *Raid_compositionRelates) Editor(subs ...*ObjUser) *Raid_compositionRelates {
	for _, sub := range subs {
		r.rel.Add("editor", sub.src.Obj, "")
	}
	return r
}

// Viewer schema.zed:121
// Relationship: raid_composition:<id>#viewer@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Viewer() etc.
func (obj *ObjRaid_composition) Viewer(subs ...*ObjUser) *ObjRaid_composition {
	for _, sub := range subs {
		obj.src.Touch().Add("viewer", sub.src.Obj, "")
	}
	return obj
}

// Viewer on Relates uses the specified operation (Touch/Create/Delete)
func (r *Raid_compositionRelates) Viewer(subs ...*ObjUser) *Raid_compositionRelates {
	for _, sub := range subs {
		r.rel.Add("viewer", sub.src.Obj, "")
	}
	return r
}

// Public_viewerWildcard schema.zed:122
// Relationship: raid_composition:<id>#public_viewer@user:*
func (obj *ObjRaid_composition) Public_viewerWildcard() *ObjRaid_composition {
	obj.src.Touch().Add("public_viewer", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return obj
}

// Public_viewerWildcard on Relates uses the specified operation
func (r *Raid_compositionRelates) Public_viewerWildcard() *Raid_compositionRelates {
	r.rel.Add("public_viewer", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return r
}

// CanView_Chronicle checks if the subject has view permission
// // Object: raid_composition:<id>
// Schema: permission view = owner + editor + viewer + public_viewer + chronicle->administer
func (obj *ObjRaid_composition) CanView_Chronicle(sub *ObjChronicle) rel.Relationship {
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
// // Object: raid_composition:<id>
// Schema: permission view = owner + editor + viewer + public_viewer + chronicle->administer
func (obj *ObjRaid_composition) CanView_User(sub *ObjUser) rel.Relationship {
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

// CanEdit_Chronicle checks if the subject has edit permission
// // Object: raid_composition:<id>
// Schema: permission edit = owner + editor + chronicle->administer
func (obj *ObjRaid_composition) CanEdit_Chronicle(sub *ObjChronicle) rel.Relationship {
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
// // Object: raid_composition:<id>
// Schema: permission edit = owner + editor + chronicle->administer
func (obj *ObjRaid_composition) CanEdit_User(sub *ObjUser) rel.Relationship {
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

// CanDelete_Chronicle checks if the subject has delete permission
// // Object: raid_composition:<id>
// Schema: permission delete = owner + chronicle->administer
func (obj *ObjRaid_composition) CanDelete_Chronicle(sub *ObjChronicle) rel.Relationship {
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
// // Object: raid_composition:<id>
// Schema: permission delete = owner + chronicle->administer
func (obj *ObjRaid_composition) CanDelete_User(sub *ObjUser) rel.Relationship {
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

// CanManage_sharing_Chronicle checks if the subject has manage_sharing permission
// // Object: raid_composition:<id>
// Schema: permission manage_sharing = owner + chronicle->administer
func (obj *ObjRaid_composition) CanManage_sharing_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_sharing",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_sharing_User checks if the subject has manage_sharing permission
// // Object: raid_composition:<id>
// Schema: permission manage_sharing = owner + chronicle->administer
func (obj *ObjRaid_composition) CanManage_sharing_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_sharing",
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

// Chronicle schema.zed:168
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

// Uploader schema.zed:169
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

// Chronicle schema.zed:131
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

type ObjTalent_build struct {
	src Object
}

func (b *SchemaBuilder) Talent_build(id fmt.Stringer) *ObjTalent_build {
	return &ObjTalent_build{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "talent_build",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjTalent_build) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjTalent_build) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjTalent_build) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjTalent_build) RelationOwner() string {
	return "owner"
}

func (obj *ObjTalent_build) PermissionEdit() string {
	return "edit"
}

func (obj *ObjTalent_build) PermissionDelete() string {
	return "delete"
}

type Talent_buildRelates struct {
	obj *ObjTalent_build
	rel Relationship
}

func (obj *ObjTalent_build) Touch() *Talent_buildRelates {
	return &Talent_buildRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjTalent_build) Delete() *Talent_buildRelates {
	return &Talent_buildRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjTalent_build) Create() *Talent_buildRelates {
	return &Talent_buildRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:106
// Relationship: talent_build:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjTalent_build) Chronicle(subs ...*ObjChronicle) *ObjTalent_build {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Talent_buildRelates) Chronicle(subs ...*ObjChronicle) *Talent_buildRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Owner schema.zed:107
// Relationship: talent_build:<id>#owner@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Owner() etc.
func (obj *ObjTalent_build) Owner(subs ...*ObjUser) *ObjTalent_build {
	for _, sub := range subs {
		obj.src.Touch().Add("owner", sub.src.Obj, "")
	}
	return obj
}

// Owner on Relates uses the specified operation (Touch/Create/Delete)
func (r *Talent_buildRelates) Owner(subs ...*ObjUser) *Talent_buildRelates {
	for _, sub := range subs {
		r.rel.Add("owner", sub.src.Obj, "")
	}
	return r
}

// CanEdit_Chronicle checks if the subject has edit permission
// // Object: talent_build:<id>
// Schema: permission edit = owner + chronicle->administer
func (obj *ObjTalent_build) CanEdit_Chronicle(sub *ObjChronicle) rel.Relationship {
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
// // Object: talent_build:<id>
// Schema: permission edit = owner + chronicle->administer
func (obj *ObjTalent_build) CanEdit_User(sub *ObjUser) rel.Relationship {
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

// CanDelete_Chronicle checks if the subject has delete permission
// // Object: talent_build:<id>
// Schema: permission delete = owner + chronicle->administer
func (obj *ObjTalent_build) CanDelete_Chronicle(sub *ObjChronicle) rel.Relationship {
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
// // Object: talent_build:<id>
// Schema: permission delete = owner + chronicle->administer
func (obj *ObjTalent_build) CanDelete_User(sub *ObjUser) rel.Relationship {
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

type ObjWow_server struct {
	src Object
}

func (b *SchemaBuilder) Wow_server(id fmt.Stringer) *ObjWow_server {
	return &ObjWow_server{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "wow_server",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjWow_server) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjWow_server) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjWow_server) RelationAdmin() string {
	return "admin"
}

func (obj *ObjWow_server) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjWow_server) RelationTenant() string {
	return "tenant"
}

func (obj *ObjWow_server) PermissionUpload_log() string {
	return "upload_log"
}

func (obj *ObjWow_server) PermissionAdminister() string {
	return "administer"
}

func (obj *ObjWow_server) PermissionManage_log_retention() string {
	return "manage_log_retention"
}

type Wow_serverRelates struct {
	obj *ObjWow_server
	rel Relationship
}

func (obj *ObjWow_server) Touch() *Wow_serverRelates {
	return &Wow_serverRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjWow_server) Delete() *Wow_serverRelates {
	return &Wow_serverRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjWow_server) Create() *Wow_serverRelates {
	return &Wow_serverRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:76
// Relationship: wow_server:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjWow_server) Chronicle(subs ...*ObjChronicle) *ObjWow_server {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_serverRelates) Chronicle(subs ...*ObjChronicle) *Wow_serverRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Admin schema.zed:77
// Relationship: wow_server:<id>#admin@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Admin() etc.
func (obj *ObjWow_server) Admin(subs ...*ObjUser) *ObjWow_server {
	for _, sub := range subs {
		obj.src.Touch().Add("admin", sub.src.Obj, "")
	}
	return obj
}

// Admin on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_serverRelates) Admin(subs ...*ObjUser) *Wow_serverRelates {
	for _, sub := range subs {
		r.rel.Add("admin", sub.src.Obj, "")
	}
	return r
}

// Tenant schema.zed:78
// Relationship: wow_server:<id>#tenant@wow_tenant:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Tenant() etc.
func (obj *ObjWow_server) Tenant(subs ...*ObjWow_tenant) *ObjWow_server {
	for _, sub := range subs {
		obj.src.Touch().Add("tenant", sub.src.Obj, "")
	}
	return obj
}

// Tenant on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_serverRelates) Tenant(subs ...*ObjWow_tenant) *Wow_serverRelates {
	for _, sub := range subs {
		r.rel.Add("tenant", sub.src.Obj, "")
	}
	return r
}

// CanUpload_log_Chronicle checks if the subject has upload_log permission
// // Object: wow_server:<id>
// Schema: permission upload_log = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanUpload_log_Chronicle(sub *ObjChronicle) rel.Relationship {
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

// CanUpload_log_User checks if the subject has upload_log permission
// // Object: wow_server:<id>
// Schema: permission upload_log = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanUpload_log_User(sub *ObjUser) rel.Relationship {
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

// CanUpload_log_Wow_tenant checks if the subject has upload_log permission
// // Object: wow_server:<id>
// Schema: permission upload_log = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanUpload_log_Wow_tenant(sub *ObjWow_tenant) rel.Relationship {
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

// CanAdminister_Chronicle checks if the subject has administer permission
// // Object: wow_server:<id>
// Schema: permission administer = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanAdminister_Chronicle(sub *ObjChronicle) rel.Relationship {
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

// CanAdminister_User checks if the subject has administer permission
// // Object: wow_server:<id>
// Schema: permission administer = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanAdminister_User(sub *ObjUser) rel.Relationship {
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

// CanAdminister_Wow_tenant checks if the subject has administer permission
// // Object: wow_server:<id>
// Schema: permission administer = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanAdminister_Wow_tenant(sub *ObjWow_tenant) rel.Relationship {
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

// CanManage_log_retention_Chronicle checks if the subject has manage_log_retention permission
// // Object: wow_server:<id>
// Schema: permission manage_log_retention = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanManage_log_retention_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_log_retention",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_log_retention_User checks if the subject has manage_log_retention permission
// // Object: wow_server:<id>
// Schema: permission manage_log_retention = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanManage_log_retention_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_log_retention",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_log_retention_Wow_tenant checks if the subject has manage_log_retention permission
// // Object: wow_server:<id>
// Schema: permission manage_log_retention = admin + chronicle->admin_servers
func (obj *ObjWow_server) CanManage_log_retention_Wow_tenant(sub *ObjWow_tenant) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_log_retention",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjWow_server_realm struct {
	src Object
}

func (b *SchemaBuilder) Wow_server_realm(id fmt.Stringer) *ObjWow_server_realm {
	return &ObjWow_server_realm{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "wow_server_realm",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjWow_server_realm) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjWow_server_realm) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjWow_server_realm) RelationWorld_daemon() string {
	return "world_daemon"
}

func (obj *ObjWow_server_realm) RelationWow_server() string {
	return "wow_server"
}

func (obj *ObjWow_server_realm) PermissionAdminister() string {
	return "administer"
}

func (obj *ObjWow_server_realm) PermissionUpload_log() string {
	return "upload_log"
}

func (obj *ObjWow_server_realm) PermissionManage_log_retention() string {
	return "manage_log_retention"
}

type Wow_server_realmRelates struct {
	obj *ObjWow_server_realm
	rel Relationship
}

func (obj *ObjWow_server_realm) Touch() *Wow_server_realmRelates {
	return &Wow_server_realmRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjWow_server_realm) Delete() *Wow_server_realmRelates {
	return &Wow_server_realmRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjWow_server_realm) Create() *Wow_server_realmRelates {
	return &Wow_server_realmRelates{obj: obj, rel: obj.src.Create()}
}

// Wow_server schema.zed:87
// Relationship: wow_server_realm:<id>#wow_server@wow_server:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Wow_server() etc.
func (obj *ObjWow_server_realm) Wow_server(subs ...*ObjWow_server) *ObjWow_server_realm {
	for _, sub := range subs {
		obj.src.Touch().Add("wow_server", sub.src.Obj, "")
	}
	return obj
}

// Wow_server on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_server_realmRelates) Wow_server(subs ...*ObjWow_server) *Wow_server_realmRelates {
	for _, sub := range subs {
		r.rel.Add("wow_server", sub.src.Obj, "")
	}
	return r
}

// World_daemon schema.zed:88
// Relationship: wow_server_realm:<id>#world_daemon@wow_server_upload_key:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().World_daemon() etc.
func (obj *ObjWow_server_realm) World_daemon(subs ...*ObjWow_server_upload_key) *ObjWow_server_realm {
	for _, sub := range subs {
		obj.src.Touch().Add("world_daemon", sub.src.Obj, "")
	}
	return obj
}

// World_daemon on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_server_realmRelates) World_daemon(subs ...*ObjWow_server_upload_key) *Wow_server_realmRelates {
	for _, sub := range subs {
		r.rel.Add("world_daemon", sub.src.Obj, "")
	}
	return r
}

// CanAdminister_Wow_server checks if the subject has administer permission
// // Object: wow_server_realm:<id>
// Schema: permission administer = wow_server->administer
func (obj *ObjWow_server_realm) CanAdminister_Wow_server(sub *ObjWow_server) rel.Relationship {
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

// CanAdminister_Wow_server_upload_key checks if the subject has administer permission
// // Object: wow_server_realm:<id>
// Schema: permission administer = wow_server->administer
func (obj *ObjWow_server_realm) CanAdminister_Wow_server_upload_key(sub *ObjWow_server_upload_key) rel.Relationship {
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

// CanUpload_log_Wow_server checks if the subject has upload_log permission
// // Object: wow_server_realm:<id>
// Schema: permission upload_log = world_daemon + wow_server->upload_log
func (obj *ObjWow_server_realm) CanUpload_log_Wow_server(sub *ObjWow_server) rel.Relationship {
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

// CanUpload_log_Wow_server_upload_key checks if the subject has upload_log permission
// // Object: wow_server_realm:<id>
// Schema: permission upload_log = world_daemon + wow_server->upload_log
func (obj *ObjWow_server_realm) CanUpload_log_Wow_server_upload_key(sub *ObjWow_server_upload_key) rel.Relationship {
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

// CanManage_log_retention_Wow_server checks if the subject has manage_log_retention permission
// // Object: wow_server_realm:<id>
// Schema: permission manage_log_retention = wow_server->manage_log_retention
func (obj *ObjWow_server_realm) CanManage_log_retention_Wow_server(sub *ObjWow_server) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_log_retention",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanManage_log_retention_Wow_server_upload_key checks if the subject has manage_log_retention permission
// // Object: wow_server_realm:<id>
// Schema: permission manage_log_retention = wow_server->manage_log_retention
func (obj *ObjWow_server_realm) CanManage_log_retention_Wow_server_upload_key(sub *ObjWow_server_upload_key) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "manage_log_retention",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjWow_server_upload_key struct {
	src Object
}

func (b *SchemaBuilder) Wow_server_upload_key(id fmt.Stringer) *ObjWow_server_upload_key {
	return &ObjWow_server_upload_key{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "wow_server_upload_key",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjWow_server_upload_key) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjWow_server_upload_key) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

type ObjWow_tenant struct {
	src Object
}

func (b *SchemaBuilder) Wow_tenant(id fmt.Stringer) *ObjWow_tenant {
	return &ObjWow_tenant{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "wow_tenant",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjWow_tenant) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjWow_tenant) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjWow_tenant) RelationAdmin() string {
	return "admin"
}

func (obj *ObjWow_tenant) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjWow_tenant) PermissionAdminister() string {
	return "administer"
}

type Wow_tenantRelates struct {
	obj *ObjWow_tenant
	rel Relationship
}

func (obj *ObjWow_tenant) Touch() *Wow_tenantRelates {
	return &Wow_tenantRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjWow_tenant) Delete() *Wow_tenantRelates {
	return &Wow_tenantRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjWow_tenant) Create() *Wow_tenantRelates {
	return &Wow_tenantRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle schema.zed:59
// Relationship: wow_tenant:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjWow_tenant) Chronicle(subs ...*ObjChronicle) *ObjWow_tenant {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_tenantRelates) Chronicle(subs ...*ObjChronicle) *Wow_tenantRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Admin schema.zed:60
// Relationship: wow_tenant:<id>#admin@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Admin() etc.
func (obj *ObjWow_tenant) Admin(subs ...*ObjUser) *ObjWow_tenant {
	for _, sub := range subs {
		obj.src.Touch().Add("admin", sub.src.Obj, "")
	}
	return obj
}

// Admin on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_tenantRelates) Admin(subs ...*ObjUser) *Wow_tenantRelates {
	for _, sub := range subs {
		r.rel.Add("admin", sub.src.Obj, "")
	}
	return r
}

// CanAdminister_Chronicle checks if the subject has administer permission
// // Object: wow_tenant:<id>
// Schema: permission administer = admin + chronicle->admin_tenants + chronicle->admin_tenants
func (obj *ObjWow_tenant) CanAdminister_Chronicle(sub *ObjChronicle) rel.Relationship {
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

// CanAdminister_User checks if the subject has administer permission
// // Object: wow_tenant:<id>
// Schema: permission administer = admin + chronicle->admin_tenants + chronicle->admin_tenants
func (obj *ObjWow_tenant) CanAdminister_User(sub *ObjUser) rel.Relationship {
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

type ObjWow_tenant_application struct {
	src Object
}

func (b *SchemaBuilder) Wow_tenant_application(id fmt.Stringer) *ObjWow_tenant_application {
	return &ObjWow_tenant_application{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "wow_tenant_application",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjWow_tenant_application) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjWow_tenant_application) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjWow_tenant_application) RelationAdmin() string {
	return "admin"
}

func (obj *ObjWow_tenant_application) RelationWow_tenant() string {
	return "wow_tenant"
}

func (obj *ObjWow_tenant_application) PermissionAdminister() string {
	return "administer"
}

type Wow_tenant_applicationRelates struct {
	obj *ObjWow_tenant_application
	rel Relationship
}

func (obj *ObjWow_tenant_application) Touch() *Wow_tenant_applicationRelates {
	return &Wow_tenant_applicationRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjWow_tenant_application) Delete() *Wow_tenant_applicationRelates {
	return &Wow_tenant_applicationRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjWow_tenant_application) Create() *Wow_tenant_applicationRelates {
	return &Wow_tenant_applicationRelates{obj: obj, rel: obj.src.Create()}
}

// Wow_tenant schema.zed:67
// Relationship: wow_tenant_application:<id>#wow_tenant@wow_tenant:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Wow_tenant() etc.
func (obj *ObjWow_tenant_application) Wow_tenant(subs ...*ObjWow_tenant) *ObjWow_tenant_application {
	for _, sub := range subs {
		obj.src.Touch().Add("wow_tenant", sub.src.Obj, "")
	}
	return obj
}

// Wow_tenant on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_tenant_applicationRelates) Wow_tenant(subs ...*ObjWow_tenant) *Wow_tenant_applicationRelates {
	for _, sub := range subs {
		r.rel.Add("wow_tenant", sub.src.Obj, "")
	}
	return r
}

// Admin schema.zed:70
// Relationship: wow_tenant_application:<id>#admin@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Admin() etc.
func (obj *ObjWow_tenant_application) Admin(subs ...*ObjUser) *ObjWow_tenant_application {
	for _, sub := range subs {
		obj.src.Touch().Add("admin", sub.src.Obj, "")
	}
	return obj
}

// Admin on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_tenant_applicationRelates) Admin(subs ...*ObjUser) *Wow_tenant_applicationRelates {
	for _, sub := range subs {
		r.rel.Add("admin", sub.src.Obj, "")
	}
	return r
}

// CanAdminister_Wow_tenant checks if the subject has administer permission
// // Object: wow_tenant_application:<id>
// Schema: permission administer = admin + wow_tenant->administer
func (obj *ObjWow_tenant_application) CanAdminister_Wow_tenant(sub *ObjWow_tenant) rel.Relationship {
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

// CanAdminister_User checks if the subject has administer permission
// // Object: wow_tenant_application:<id>
// Schema: permission administer = admin + wow_tenant->administer
func (obj *ObjWow_tenant_application) CanAdminister_User(sub *ObjUser) rel.Relationship {
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
