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

// Chronicle database/authz/policy/schema.zed:232
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

// Owner database/authz/policy/schema.zed:235
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

func (obj *ObjChronicle) RelationAd_free_capable() string {
	return "ad_free_capable"
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

func (obj *ObjChronicle) RelationExalted() string {
	return "exalted"
}

func (obj *ObjChronicle) RelationHonored() string {
	return "honored"
}

func (obj *ObjChronicle) RelationInference_capable() string {
	return "inference_capable"
}

func (obj *ObjChronicle) RelationInference_debug_capable() string {
	return "inference_debug_capable"
}

func (obj *ObjChronicle) RelationInference_disabled() string {
	return "inference_disabled"
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

func (obj *ObjChronicle) RelationLua_project_author() string {
	return "lua_project_author"
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

func (obj *ObjChronicle) RelationPhoto_proof_banned() string {
	return "photo_proof_banned"
}

func (obj *ObjChronicle) RelationPhoto_proof_reviewer() string {
	return "photo_proof_reviewer"
}

func (obj *ObjChronicle) RelationPhoto_proof_submitter() string {
	return "photo_proof_submitter"
}

func (obj *ObjChronicle) RelationRevered() string {
	return "revered"
}

func (obj *ObjChronicle) RelationStripe_ad_free() string {
	return "stripe_ad_free"
}

func (obj *ObjChronicle) RelationStripe_download_raw_logs() string {
	return "stripe_download_raw_logs"
}

func (obj *ObjChronicle) RelationStripe_exalted() string {
	return "stripe_exalted"
}

func (obj *ObjChronicle) RelationStripe_honored() string {
	return "stripe_honored"
}

func (obj *ObjChronicle) RelationStripe_revered() string {
	return "stripe_revered"
}

func (obj *ObjChronicle) RelationStripe_submit_photo_proof() string {
	return "stripe_submit_photo_proof"
}

func (obj *ObjChronicle) RelationStripe_unlisted_logs() string {
	return "stripe_unlisted_logs"
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

func (obj *ObjChronicle) RelationUnlisted_log_capable() string {
	return "unlisted_log_capable"
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

func (obj *ObjChronicle) PermissionInvalidate_logs() string {
	return "invalidate_logs"
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

func (obj *ObjChronicle) PermissionAd_free() string {
	return "ad_free"
}

func (obj *ObjChronicle) PermissionLinked_characters_ad_free() string {
	return "linked_characters_ad_free"
}

func (obj *ObjChronicle) PermissionUploaded_logs_ad_free() string {
	return "uploaded_logs_ad_free"
}

func (obj *ObjChronicle) PermissionDownload_raw_logs() string {
	return "download_raw_logs"
}

func (obj *ObjChronicle) PermissionUnlisted_logs() string {
	return "unlisted_logs"
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

func (obj *ObjChronicle) PermissionMark_log_unlisted() string {
	return "mark_log_unlisted"
}

func (obj *ObjChronicle) PermissionInference_available() string {
	return "inference_available"
}

func (obj *ObjChronicle) PermissionDebug_inference_chat() string {
	return "debug_inference_chat"
}

func (obj *ObjChronicle) PermissionUse_inference_chat() string {
	return "use_inference_chat"
}

func (obj *ObjChronicle) PermissionCreate_lua_project() string {
	return "create_lua_project"
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

func (obj *ObjChronicle) PermissionSubmit_photo_proof() string {
	return "submit_photo_proof"
}

func (obj *ObjChronicle) PermissionReview_photo_proof() string {
	return "review_photo_proof"
}

func (obj *ObjChronicle) PermissionCreate_tenant_application() string {
	return "create_tenant_application"
}

func (obj *ObjChronicle) PermissionHonored_cosmetics() string {
	return "honored_cosmetics"
}

func (obj *ObjChronicle) PermissionRevered_cosmetics() string {
	return "revered_cosmetics"
}

func (obj *ObjChronicle) PermissionExalted_cosmetics() string {
	return "exalted_cosmetics"
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

// Technical_admin database/authz/policy/schema.zed:11
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

// Admin database/authz/policy/schema.zed:12
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

// Upload_capable database/authz/policy/schema.zed:13
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

// Unlisted_log_capable database/authz/policy/schema.zed:14
// Relationship: chronicle:<id>#unlisted_log_capable@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Unlisted_log_capable() etc.
func (obj *ObjChronicle) Unlisted_log_capable(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("unlisted_log_capable", sub.src.Obj, "")
	}
	return obj
}

// Unlisted_log_capable on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Unlisted_log_capable(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("unlisted_log_capable", sub.src.Obj, "")
	}
	return r
}

// Ad_free_capable database/authz/policy/schema.zed:15
// Relationship: chronicle:<id>#ad_free_capable@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Ad_free_capable() etc.
func (obj *ObjChronicle) Ad_free_capable(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("ad_free_capable", sub.src.Obj, "")
	}
	return obj
}

// Ad_free_capable on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Ad_free_capable(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("ad_free_capable", sub.src.Obj, "")
	}
	return r
}

// Inference_capable database/authz/policy/schema.zed:16
// Relationship: chronicle:<id>#inference_capable@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Inference_capable() etc.
func (obj *ObjChronicle) Inference_capable(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("inference_capable", sub.src.Obj, "")
	}
	return obj
}

// Inference_capable on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Inference_capable(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("inference_capable", sub.src.Obj, "")
	}
	return r
}

// Inference_debug_capable database/authz/policy/schema.zed:17
// Relationship: chronicle:<id>#inference_debug_capable@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Inference_debug_capable() etc.
func (obj *ObjChronicle) Inference_debug_capable(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("inference_debug_capable", sub.src.Obj, "")
	}
	return obj
}

// Inference_debug_capable on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Inference_debug_capable(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("inference_debug_capable", sub.src.Obj, "")
	}
	return r
}

// Inference_disabled database/authz/policy/schema.zed:18
// Relationship: chronicle:<id>#inference_disabled@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Inference_disabled() etc.
func (obj *ObjChronicle) Inference_disabled(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("inference_disabled", sub.src.Obj, "")
	}
	return obj
}

// Inference_disabled on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Inference_disabled(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("inference_disabled", sub.src.Obj, "")
	}
	return r
}

// Lua_project_author database/authz/policy/schema.zed:19
// Relationship: chronicle:<id>#lua_project_author@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Lua_project_author() etc.
func (obj *ObjChronicle) Lua_project_author(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("lua_project_author", sub.src.Obj, "")
	}
	return obj
}

// Lua_project_author on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Lua_project_author(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("lua_project_author", sub.src.Obj, "")
	}
	return r
}

// Technical_user database/authz/policy/schema.zed:20
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

// Supporter database/authz/policy/schema.zed:21
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

// Photo_proof_submitter database/authz/policy/schema.zed:25
// Relationship: chronicle:<id>#photo_proof_submitter@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Photo_proof_submitter() etc.
func (obj *ObjChronicle) Photo_proof_submitter(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("photo_proof_submitter", sub.src.Obj, "")
	}
	return obj
}

// Photo_proof_submitter on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Photo_proof_submitter(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("photo_proof_submitter", sub.src.Obj, "")
	}
	return r
}

// Photo_proof_reviewer database/authz/policy/schema.zed:26
// Relationship: chronicle:<id>#photo_proof_reviewer@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Photo_proof_reviewer() etc.
func (obj *ObjChronicle) Photo_proof_reviewer(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("photo_proof_reviewer", sub.src.Obj, "")
	}
	return obj
}

// Photo_proof_reviewer on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Photo_proof_reviewer(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("photo_proof_reviewer", sub.src.Obj, "")
	}
	return r
}

// Photo_proof_banned database/authz/policy/schema.zed:27
// Relationship: chronicle:<id>#photo_proof_banned@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Photo_proof_banned() etc.
func (obj *ObjChronicle) Photo_proof_banned(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("photo_proof_banned", sub.src.Obj, "")
	}
	return obj
}

// Photo_proof_banned on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Photo_proof_banned(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("photo_proof_banned", sub.src.Obj, "")
	}
	return r
}

// Stripe_ad_free database/authz/policy/schema.zed:30
// Relationship: chronicle:<id>#stripe_ad_free@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_ad_free() etc.
func (obj *ObjChronicle) Stripe_ad_free(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_ad_free", sub.src.Obj, "")
	}
	return obj
}

// Stripe_ad_free on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_ad_free(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_ad_free", sub.src.Obj, "")
	}
	return r
}

// Stripe_download_raw_logs database/authz/policy/schema.zed:31
// Relationship: chronicle:<id>#stripe_download_raw_logs@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_download_raw_logs() etc.
func (obj *ObjChronicle) Stripe_download_raw_logs(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_download_raw_logs", sub.src.Obj, "")
	}
	return obj
}

// Stripe_download_raw_logs on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_download_raw_logs(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_download_raw_logs", sub.src.Obj, "")
	}
	return r
}

// Stripe_unlisted_logs database/authz/policy/schema.zed:32
// Relationship: chronicle:<id>#stripe_unlisted_logs@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_unlisted_logs() etc.
func (obj *ObjChronicle) Stripe_unlisted_logs(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_unlisted_logs", sub.src.Obj, "")
	}
	return obj
}

// Stripe_unlisted_logs on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_unlisted_logs(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_unlisted_logs", sub.src.Obj, "")
	}
	return r
}

// Stripe_submit_photo_proof database/authz/policy/schema.zed:33
// Relationship: chronicle:<id>#stripe_submit_photo_proof@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_submit_photo_proof() etc.
func (obj *ObjChronicle) Stripe_submit_photo_proof(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_submit_photo_proof", sub.src.Obj, "")
	}
	return obj
}

// Stripe_submit_photo_proof on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_submit_photo_proof(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_submit_photo_proof", sub.src.Obj, "")
	}
	return r
}

// Honored database/authz/policy/schema.zed:36
// Relationship: chronicle:<id>#honored@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Honored() etc.
func (obj *ObjChronicle) Honored(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("honored", sub.src.Obj, "")
	}
	return obj
}

// Honored on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Honored(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("honored", sub.src.Obj, "")
	}
	return r
}

// Revered database/authz/policy/schema.zed:37
// Relationship: chronicle:<id>#revered@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Revered() etc.
func (obj *ObjChronicle) Revered(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("revered", sub.src.Obj, "")
	}
	return obj
}

// Revered on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Revered(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("revered", sub.src.Obj, "")
	}
	return r
}

// Exalted database/authz/policy/schema.zed:38
// Relationship: chronicle:<id>#exalted@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Exalted() etc.
func (obj *ObjChronicle) Exalted(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("exalted", sub.src.Obj, "")
	}
	return obj
}

// Exalted on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Exalted(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("exalted", sub.src.Obj, "")
	}
	return r
}

// Stripe_honored database/authz/policy/schema.zed:39
// Relationship: chronicle:<id>#stripe_honored@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_honored() etc.
func (obj *ObjChronicle) Stripe_honored(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_honored", sub.src.Obj, "")
	}
	return obj
}

// Stripe_honored on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_honored(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_honored", sub.src.Obj, "")
	}
	return r
}

// Stripe_revered database/authz/policy/schema.zed:40
// Relationship: chronicle:<id>#stripe_revered@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_revered() etc.
func (obj *ObjChronicle) Stripe_revered(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_revered", sub.src.Obj, "")
	}
	return obj
}

// Stripe_revered on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_revered(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_revered", sub.src.Obj, "")
	}
	return r
}

// Stripe_exalted database/authz/policy/schema.zed:41
// Relationship: chronicle:<id>#stripe_exalted@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Stripe_exalted() etc.
func (obj *ObjChronicle) Stripe_exalted(subs ...*ObjUser) *ObjChronicle {
	for _, sub := range subs {
		obj.src.Touch().Add("stripe_exalted", sub.src.Obj, "")
	}
	return obj
}

// Stripe_exalted on Relates uses the specified operation (Touch/Create/Delete)
func (r *ChronicleRelates) Stripe_exalted(subs ...*ObjUser) *ChronicleRelates {
	for _, sub := range subs {
		r.rel.Add("stripe_exalted", sub.src.Obj, "")
	}
	return r
}

// Chronicle_guild_member database/authz/policy/schema.zed:43
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

// Chronicle_member database/authz/policy/schema.zed:44
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

// Moderate_logs database/authz/policy/schema.zed:47
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

// Moderate_guilds database/authz/policy/schema.zed:48
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

// Is_admin_users database/authz/policy/schema.zed:49
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

// Is_admin_queues database/authz/policy/schema.zed:50
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

// Is_admin_game_data database/authz/policy/schema.zed:51
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

// Manage_consumables database/authz/policy/schema.zed:52
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

// Is_admin_raid_requirements database/authz/policy/schema.zed:53
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

// CanInvalidate_logs_User checks if the subject has invalidate_logs permission
// // Object: chronicle:<id>
// Schema: permission invalidate_logs = technical_admin
func (obj *ObjChronicle) CanInvalidate_logs_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "invalidate_logs",
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

// CanAd_free_User checks if the subject has ad_free permission
// // Object: chronicle:<id>
// Schema: permission ad_free = ad_free_capable + supporter + stripe_ad_free
func (obj *ObjChronicle) CanAd_free_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "ad_free",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanLinked_characters_ad_free_User checks if the subject has linked_characters_ad_free permission
// // Object: chronicle:<id>
// Schema: permission linked_characters_ad_free = revered + exalted + stripe_revered + stripe_exalted
func (obj *ObjChronicle) CanLinked_characters_ad_free_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "linked_characters_ad_free",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUploaded_logs_ad_free_User checks if the subject has uploaded_logs_ad_free permission
// // Object: chronicle:<id>
// Schema: permission uploaded_logs_ad_free = revered + exalted + stripe_revered + stripe_exalted
func (obj *ObjChronicle) CanUploaded_logs_ad_free_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "uploaded_logs_ad_free",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDownload_raw_logs_User checks if the subject has download_raw_logs permission
// // Object: chronicle:<id>
// Schema: permission download_raw_logs = administer + moderate_logs + stripe_download_raw_logs
func (obj *ObjChronicle) CanDownload_raw_logs_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "download_raw_logs",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUnlisted_logs_User checks if the subject has unlisted_logs permission
// // Object: chronicle:<id>
// Schema: permission unlisted_logs = stripe_unlisted_logs
func (obj *ObjChronicle) CanUnlisted_logs_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "unlisted_logs",
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

// CanMark_log_unlisted_User checks if the subject has mark_log_unlisted permission
// // Object: chronicle:<id>
// Schema: permission mark_log_unlisted = unlisted_log_capable + admin_logs + unlisted_logs
func (obj *ObjChronicle) CanMark_log_unlisted_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "mark_log_unlisted",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanInference_available_User checks if the subject has inference_available permission
// // Object: chronicle:<id>
// Schema: permission inference_available = inference_capable + administer
func (obj *ObjChronicle) CanInference_available_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "inference_available",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanDebug_inference_chat_User checks if the subject has debug_inference_chat permission
// // Object: chronicle:<id>
// Schema: permission debug_inference_chat = inference_debug_capable + administer
func (obj *ObjChronicle) CanDebug_inference_chat_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "debug_inference_chat",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUse_inference_chat_User checks if the subject has use_inference_chat permission
// // Object: chronicle:<id>
// Schema: permission use_inference_chat = inference_available - inference_disabled
func (obj *ObjChronicle) CanUse_inference_chat_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "use_inference_chat",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanCreate_lua_project_User checks if the subject has create_lua_project permission
// // Object: chronicle:<id>
func (obj *ObjChronicle) CanCreate_lua_project_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "create_lua_project",
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

// CanSubmit_photo_proof_User checks if the subject has submit_photo_proof permission
// // Object: chronicle:<id>
func (obj *ObjChronicle) CanSubmit_photo_proof_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "submit_photo_proof",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanReview_photo_proof_User checks if the subject has review_photo_proof permission
// // Object: chronicle:<id>
// Schema: permission review_photo_proof = photo_proof_reviewer + technical_admin
func (obj *ObjChronicle) CanReview_photo_proof_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "review_photo_proof",
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

// CanHonored_cosmetics_User checks if the subject has honored_cosmetics permission
// // Object: chronicle:<id>
// Schema: permission honored_cosmetics = honored + revered + exalted + stripe_honored + stripe_revered + stripe_exalted
func (obj *ObjChronicle) CanHonored_cosmetics_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "honored_cosmetics",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanRevered_cosmetics_User checks if the subject has revered_cosmetics permission
// // Object: chronicle:<id>
// Schema: permission revered_cosmetics = revered + exalted + stripe_revered + stripe_exalted
func (obj *ObjChronicle) CanRevered_cosmetics_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "revered_cosmetics",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanExalted_cosmetics_User checks if the subject has exalted_cosmetics permission
// // Object: chronicle:<id>
// Schema: permission exalted_cosmetics = exalted + stripe_exalted
func (obj *ObjChronicle) CanExalted_cosmetics_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "exalted_cosmetics",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

type ObjCosmetic struct {
	src Object
}

func (b *SchemaBuilder) Cosmetic(id fmt.Stringer) *ObjCosmetic {
	return &ObjCosmetic{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "cosmetic",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjCosmetic) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjCosmetic) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjCosmetic) RelationExalted() string {
	return "exalted"
}

func (obj *ObjCosmetic) RelationHonored() string {
	return "honored"
}

func (obj *ObjCosmetic) RelationRevered() string {
	return "revered"
}

func (obj *ObjCosmetic) PermissionUse() string {
	return "use"
}

type CosmeticRelates struct {
	obj *ObjCosmetic
	rel Relationship
}

func (obj *ObjCosmetic) Touch() *CosmeticRelates {
	return &CosmeticRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjCosmetic) Delete() *CosmeticRelates {
	return &CosmeticRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjCosmetic) Create() *CosmeticRelates {
	return &CosmeticRelates{obj: obj, rel: obj.src.Create()}
}

// Honored database/authz/policy/schema.zed:103
// Relationship: cosmetic:<id>#honored@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Honored() etc.
func (obj *ObjCosmetic) Honored(subs ...*ObjChronicle) *ObjCosmetic {
	for _, sub := range subs {
		obj.src.Touch().Add("honored", sub.src.Obj, "")
	}
	return obj
}

// Honored on Relates uses the specified operation (Touch/Create/Delete)
func (r *CosmeticRelates) Honored(subs ...*ObjChronicle) *CosmeticRelates {
	for _, sub := range subs {
		r.rel.Add("honored", sub.src.Obj, "")
	}
	return r
}

// Revered database/authz/policy/schema.zed:104
// Relationship: cosmetic:<id>#revered@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Revered() etc.
func (obj *ObjCosmetic) Revered(subs ...*ObjChronicle) *ObjCosmetic {
	for _, sub := range subs {
		obj.src.Touch().Add("revered", sub.src.Obj, "")
	}
	return obj
}

// Revered on Relates uses the specified operation (Touch/Create/Delete)
func (r *CosmeticRelates) Revered(subs ...*ObjChronicle) *CosmeticRelates {
	for _, sub := range subs {
		r.rel.Add("revered", sub.src.Obj, "")
	}
	return r
}

// Exalted database/authz/policy/schema.zed:105
// Relationship: cosmetic:<id>#exalted@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Exalted() etc.
func (obj *ObjCosmetic) Exalted(subs ...*ObjChronicle) *ObjCosmetic {
	for _, sub := range subs {
		obj.src.Touch().Add("exalted", sub.src.Obj, "")
	}
	return obj
}

// Exalted on Relates uses the specified operation (Touch/Create/Delete)
func (r *CosmeticRelates) Exalted(subs ...*ObjChronicle) *CosmeticRelates {
	for _, sub := range subs {
		r.rel.Add("exalted", sub.src.Obj, "")
	}
	return r
}

// CanUse_Chronicle checks if the subject has use permission
// // Object: cosmetic:<id>
// Schema: permission use = honored->honored_cosmetics + revered->revered_cosmetics + exalted->exalted_cosmetics
func (obj *ObjCosmetic) CanUse_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "use",
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

// Chronicle database/authz/policy/schema.zed:211
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

// Leader database/authz/policy/schema.zed:213
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

// Member database/authz/policy/schema.zed:214
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

// Discord_bot_enabledWildcard database/authz/policy/schema.zed:218
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

// Raid_log database/authz/policy/schema.zed:256
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

// PublicWildcard database/authz/policy/schema.zed:257
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

// Chronicle database/authz/policy/schema.zed:159
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

// Owner database/authz/policy/schema.zed:160
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

type ObjLua_project struct {
	src Object
}

func (b *SchemaBuilder) Lua_project(id fmt.Stringer) *ObjLua_project {
	return &ObjLua_project{
		src: b.Object(&v1.ObjectReference{
			ObjectType: "lua_project",
			ObjectId:   id.String(),
		}, ""),
	}
}

// Object returns the underlying ObjectReference for use in SpiceDB API calls.
func (obj *ObjLua_project) Object() rel.Object {
	return obj.src.Object()
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjLua_project) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjLua_project) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjLua_project) RelationOwner() string {
	return "owner"
}

func (obj *ObjLua_project) RelationPublic_viewer() string {
	return "public_viewer"
}

func (obj *ObjLua_project) PermissionUpdate() string {
	return "update"
}

func (obj *ObjLua_project) PermissionView() string {
	return "view"
}

type Lua_projectRelates struct {
	obj *ObjLua_project
	rel Relationship
}

func (obj *ObjLua_project) Touch() *Lua_projectRelates {
	return &Lua_projectRelates{obj: obj, rel: obj.src.Touch()}
}

func (obj *ObjLua_project) Delete() *Lua_projectRelates {
	return &Lua_projectRelates{obj: obj, rel: obj.src.Delete()}
}

func (obj *ObjLua_project) Create() *Lua_projectRelates {
	return &Lua_projectRelates{obj: obj, rel: obj.src.Create()}
}

// Chronicle database/authz/policy/schema.zed:169
// Relationship: lua_project:<id>#chronicle@chronicle:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Chronicle() etc.
func (obj *ObjLua_project) Chronicle(subs ...*ObjChronicle) *ObjLua_project {
	for _, sub := range subs {
		obj.src.Touch().Add("chronicle", sub.src.Obj, "")
	}
	return obj
}

// Chronicle on Relates uses the specified operation (Touch/Create/Delete)
func (r *Lua_projectRelates) Chronicle(subs ...*ObjChronicle) *Lua_projectRelates {
	for _, sub := range subs {
		r.rel.Add("chronicle", sub.src.Obj, "")
	}
	return r
}

// Owner database/authz/policy/schema.zed:170
// Relationship: lua_project:<id>#owner@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Owner() etc.
func (obj *ObjLua_project) Owner(subs ...*ObjUser) *ObjLua_project {
	for _, sub := range subs {
		obj.src.Touch().Add("owner", sub.src.Obj, "")
	}
	return obj
}

// Owner on Relates uses the specified operation (Touch/Create/Delete)
func (r *Lua_projectRelates) Owner(subs ...*ObjUser) *Lua_projectRelates {
	for _, sub := range subs {
		r.rel.Add("owner", sub.src.Obj, "")
	}
	return r
}

// Public_viewerWildcard database/authz/policy/schema.zed:171
// Relationship: lua_project:<id>#public_viewer@user:*
func (obj *ObjLua_project) Public_viewerWildcard() *ObjLua_project {
	obj.src.Touch().Add("public_viewer", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return obj
}

// Public_viewerWildcard on Relates uses the specified operation
func (r *Lua_projectRelates) Public_viewerWildcard() *Lua_projectRelates {
	r.rel.Add("public_viewer", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return r
}

// CanUpdate_Chronicle checks if the subject has update permission
// // Object: lua_project:<id>
// Schema: permission update = owner + chronicle->administer_authz
func (obj *ObjLua_project) CanUpdate_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "update",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanUpdate_User checks if the subject has update permission
// // Object: lua_project:<id>
// Schema: permission update = owner + chronicle->administer_authz
func (obj *ObjLua_project) CanUpdate_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "update",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanView_Chronicle checks if the subject has view permission
// // Object: lua_project:<id>
// Schema: permission view = owner + public_viewer + chronicle->administer_authz
func (obj *ObjLua_project) CanView_Chronicle(sub *ObjChronicle) rel.Relationship {
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
// // Object: lua_project:<id>
// Schema: permission view = owner + public_viewer + chronicle->administer_authz
func (obj *ObjLua_project) CanView_User(sub *ObjUser) rel.Relationship {
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

// Chronicle database/authz/policy/schema.zed:192
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

// Owner database/authz/policy/schema.zed:193
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

// Editor database/authz/policy/schema.zed:194
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

// Viewer database/authz/policy/schema.zed:195
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

// Public_viewerWildcard database/authz/policy/schema.zed:196
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

func (obj *ObjRaid_log) PermissionMark_unlisted() string {
	return "mark_unlisted"
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

// Chronicle database/authz/policy/schema.zed:242
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

// Uploader database/authz/policy/schema.zed:243
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
// Schema: permission view = uploader + chronicle->admin_logs
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
// Schema: permission view = uploader + chronicle->admin_logs
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

// CanMark_unlisted_Chronicle checks if the subject has mark_unlisted permission
// // Object: raid_log:<id>
// Schema: permission mark_unlisted = chronicle->admin_logs + (uploader & chronicle->mark_log_unlisted)
func (obj *ObjRaid_log) CanMark_unlisted_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "mark_unlisted",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanMark_unlisted_User checks if the subject has mark_unlisted permission
// // Object: raid_log:<id>
// Schema: permission mark_unlisted = chronicle->admin_logs + (uploader & chronicle->mark_log_unlisted)
func (obj *ObjRaid_log) CanMark_unlisted_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "mark_unlisted",
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

// Chronicle database/authz/policy/schema.zed:205
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

// Chronicle database/authz/policy/schema.zed:180
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

// Owner database/authz/policy/schema.zed:181
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

// Chronicle database/authz/policy/schema.zed:139
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

// Admin database/authz/policy/schema.zed:140
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

// Tenant database/authz/policy/schema.zed:141
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

// Wow_server database/authz/policy/schema.zed:150
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

// World_daemon database/authz/policy/schema.zed:151
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

func (obj *ObjWow_tenant) RelationPhoto_proof_reviewer() string {
	return "photo_proof_reviewer"
}

func (obj *ObjWow_tenant) RelationPhoto_proof_submitter() string {
	return "photo_proof_submitter"
}

func (obj *ObjWow_tenant) PermissionAdminister() string {
	return "administer"
}

func (obj *ObjWow_tenant) PermissionSubmit_photo_proof() string {
	return "submit_photo_proof"
}

func (obj *ObjWow_tenant) PermissionReview_photo_proof() string {
	return "review_photo_proof"
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

// Chronicle database/authz/policy/schema.zed:114
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

// Admin database/authz/policy/schema.zed:115
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

// Photo_proof_submitter database/authz/policy/schema.zed:116
// Relationship: wow_tenant:<id>#photo_proof_submitter@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Photo_proof_submitter() etc.
func (obj *ObjWow_tenant) Photo_proof_submitter(subs ...*ObjUser) *ObjWow_tenant {
	for _, sub := range subs {
		obj.src.Touch().Add("photo_proof_submitter", sub.src.Obj, "")
	}
	return obj
}

// Photo_proof_submitter on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_tenantRelates) Photo_proof_submitter(subs ...*ObjUser) *Wow_tenantRelates {
	for _, sub := range subs {
		r.rel.Add("photo_proof_submitter", sub.src.Obj, "")
	}
	return r
}

// Photo_proof_reviewer database/authz/policy/schema.zed:117
// Relationship: wow_tenant:<id>#photo_proof_reviewer@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Photo_proof_reviewer() etc.
func (obj *ObjWow_tenant) Photo_proof_reviewer(subs ...*ObjUser) *ObjWow_tenant {
	for _, sub := range subs {
		obj.src.Touch().Add("photo_proof_reviewer", sub.src.Obj, "")
	}
	return obj
}

// Photo_proof_reviewer on Relates uses the specified operation (Touch/Create/Delete)
func (r *Wow_tenantRelates) Photo_proof_reviewer(subs ...*ObjUser) *Wow_tenantRelates {
	for _, sub := range subs {
		r.rel.Add("photo_proof_reviewer", sub.src.Obj, "")
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

// CanSubmit_photo_proof_Chronicle checks if the subject has submit_photo_proof permission
// // Object: wow_tenant:<id>
func (obj *ObjWow_tenant) CanSubmit_photo_proof_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "submit_photo_proof",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanSubmit_photo_proof_User checks if the subject has submit_photo_proof permission
// // Object: wow_tenant:<id>
func (obj *ObjWow_tenant) CanSubmit_photo_proof_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "submit_photo_proof",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanReview_photo_proof_Chronicle checks if the subject has review_photo_proof permission
// // Object: wow_tenant:<id>
// Schema: permission review_photo_proof = photo_proof_reviewer + chronicle->review_photo_proof
func (obj *ObjWow_tenant) CanReview_photo_proof_Chronicle(sub *ObjChronicle) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "review_photo_proof",
		SubjectType:      s.Obj.ObjectType,
		SubjectID:        s.Obj.ObjectId,
		SubjectRelation:  s.OptionalRelation,
	}
}

// CanReview_photo_proof_User checks if the subject has review_photo_proof permission
// // Object: wow_tenant:<id>
// Schema: permission review_photo_proof = photo_proof_reviewer + chronicle->review_photo_proof
func (obj *ObjWow_tenant) CanReview_photo_proof_User(sub *ObjUser) rel.Relationship {
	r, s := obj.src.Obj, sub.src
	return rel.Relationship{
		ResourceType:     r.ObjectType,
		ResourceID:       r.ObjectId,
		ResourceRelation: "review_photo_proof",
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

// Wow_tenant database/authz/policy/schema.zed:130
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

// Admin database/authz/policy/schema.zed:133
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
