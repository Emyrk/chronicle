// Package policy code generated. DO NOT EDIT.
package policy

import (
	"fmt"

	. "github.com/Emyrk/zedgen/relbuilder"
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
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
func (obj *ObjChronicle) Object() *v1.ObjectReference {
	return obj.src.Obj
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

// Admin schema.zed:11
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
func (obj *ObjInstance) Object() *v1.ObjectReference {
	return obj.src.Obj
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjInstance) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}

func (obj *ObjInstance) RelationRaid_log() string {
	return "raid_log"
}

func (obj *ObjInstance) RelationTagged_by() string {
	return "tagged_by"
}

func (obj *ObjInstance) PermissionView() string {
	return "view"
}

func (obj *ObjInstance) PermissionEdit() string {
	return "edit"
}

func (obj *ObjInstance) PermissionTag() string {
	return "tag"
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

// Raid_log schema.zed:37
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

// Tagged_by schema.zed:38
// Relationship: instance:<id>#tagged_by@user:<id>
// Uses Touch operation implicitly. For Delete/Create, use obj.Delete().Tagged_by() etc.
func (obj *ObjInstance) Tagged_by(subs ...*ObjUser) *ObjInstance {
	for _, sub := range subs {
		obj.src.Touch().Add("tagged_by", sub.src.Obj, "")
	}
	return obj
}

// Tagged_by on Relates uses the specified operation (Touch/Create/Delete)
func (r *InstanceRelates) Tagged_by(subs ...*ObjUser) *InstanceRelates {
	for _, sub := range subs {
		r.rel.Add("tagged_by", sub.src.Obj, "")
	}
	return r
}

// CanView_Raid_log checks if the subject has view permission
// // Object: instance:<id>
func (obj *ObjInstance) CanView_Raid_log(sub *ObjRaid_log) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "view",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanView_User checks if the subject has view permission
// // Object: instance:<id>
func (obj *ObjInstance) CanView_User(sub *ObjUser) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "view",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanEdit_Raid_log checks if the subject has edit permission
// // Object: instance:<id>
// Schema: permission edit = raid_log->edit
func (obj *ObjInstance) CanEdit_Raid_log(sub *ObjRaid_log) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "edit",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanEdit_User checks if the subject has edit permission
// // Object: instance:<id>
// Schema: permission edit = raid_log->edit
func (obj *ObjInstance) CanEdit_User(sub *ObjUser) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "edit",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanTag_Raid_log checks if the subject has tag permission
// // Object: instance:<id>
// Schema: permission tag = raid_log->edit + tagged_by
func (obj *ObjInstance) CanTag_Raid_log(sub *ObjRaid_log) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "tag",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanTag_User checks if the subject has tag permission
// // Object: instance:<id>
// Schema: permission tag = raid_log->edit + tagged_by
func (obj *ObjInstance) CanTag_User(sub *ObjUser) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "tag",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
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
func (obj *ObjRaid_log) Object() *v1.ObjectReference {
	return obj.src.Obj
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

func (obj *ObjRaid_log) RelationPublic() string {
	return "public"
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

// Chronicle schema.zed:21
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

// Uploader schema.zed:22
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

// PublicWildcard schema.zed:25
// Relationship: raid_log:<id>#public@user:*
func (obj *ObjRaid_log) PublicWildcard() *ObjRaid_log {
	obj.src.Touch().Add("public", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return obj
}

// PublicWildcard on Relates uses the specified operation
func (r *Raid_logRelates) PublicWildcard() *Raid_logRelates {
	r.rel.Add("public", &v1.ObjectReference{
		ObjectType: "user",
		ObjectId:   "*",
	}, "")
	return r
}

// CanView_Chronicle checks if the subject has view permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanView_Chronicle(sub *ObjChronicle) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "view",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanView_User checks if the subject has view permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanView_User(sub *ObjUser) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "view",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanReparse_Chronicle checks if the subject has reparse permission
// // Object: raid_log:<id>
// Schema: permission reparse = chronicle->admin
func (obj *ObjRaid_log) CanReparse_Chronicle(sub *ObjChronicle) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "reparse",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanReparse_User checks if the subject has reparse permission
// // Object: raid_log:<id>
// Schema: permission reparse = chronicle->admin
func (obj *ObjRaid_log) CanReparse_User(sub *ObjUser) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "reparse",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanDelete_Chronicle checks if the subject has delete permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanDelete_Chronicle(sub *ObjChronicle) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "delete",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
	}
}

// CanDelete_User checks if the subject has delete permission
// // Object: raid_log:<id>
func (obj *ObjRaid_log) CanDelete_User(sub *ObjUser) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "delete",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
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
func (obj *ObjRiver_queue) Object() *v1.ObjectReference {
	return obj.src.Obj
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

// Chronicle schema.zed:15
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
// Schema: permission access = chronicle->admin
func (obj *ObjRiver_queue) CanAccess_Chronicle(sub *ObjChronicle) *v1.CheckPermissionRequest {
	return &v1.CheckPermissionRequest{
		Resource:   obj.src.Obj,
		Permission: "access",
		Subject: &v1.SubjectReference{
			Object:           sub.src.Obj,
			OptionalRelation: "",
		},
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
func (obj *ObjUser) Object() *v1.ObjectReference {
	return obj.src.Obj
}

// AsSubject returns this object as a SubjectReference for use in checks.
func (obj *ObjUser) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.src.Obj,
		OptionalRelation: obj.src.OptionalRelation,
	}
}
