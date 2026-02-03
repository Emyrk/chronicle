// Package policy code generated. DO NOT EDIT.
package policy

import (
	"context"
	"fmt"

	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
)

// String is used to use string literals instead of uuids.
type String string

func (s String) String() string {
	return string(s)
}

type AuthzedObject interface {
	Object() *v1.ObjectReference
	AsSubject() *v1.SubjectReference
}

// PermissionCheck can be read as:
// Can 'subject' do 'permission' on 'object'?
type PermissionCheck struct {
	// Subject has an optional
	Subject    *v1.SubjectReference
	Permission string
	Obj        *v1.ObjectReference
}

// Builder contains all the saved relationships and permission checks during
// function calls that extend from it.
// This means you can use the builder to create a set of relationships to add
// to the graph and/or a set of permission checks to validate.
type Builder struct {
	// Relationships are new graph connections to be formed.
	// This will expand the capability/permissions.
	Relationships []v1.Relationship
	// PermissionChecks are the set of capabilities required.
	PermissionChecks []PermissionCheck
}

func New() *Builder {
	return &Builder{
		Relationships:    make([]v1.Relationship, 0),
		PermissionChecks: make([]PermissionCheck, 0),
	}
}

func (b *Builder) AddRelationship(r v1.Relationship) *Builder {
	b.Relationships = append(b.Relationships, r)
	return b
}

func (b *Builder) CheckPermission(subj AuthzedObject, permission string, on AuthzedObject) *Builder {
	b.PermissionChecks = append(b.PermissionChecks, PermissionCheck{
		Subject: &v1.SubjectReference{
			Object:           subj.Object(),
			OptionalRelation: "",
		},
		Permission: permission,
		Obj:        on.Object(),
	})
	return b
}

// GlobalChronicle is a custom method to add a standard site-wide object.
func (b *Builder) GlobalChronicle() *ObjChronicle {
	return b.Chronicle(String("chronicle"))
}

type ObjChronicle struct {
	Obj              *v1.ObjectReference
	OptionalRelation string
	Builder          *Builder
}

func (b *Builder) Chronicle(id fmt.Stringer) *ObjChronicle {
	o := &ObjChronicle{
		Obj: &v1.ObjectReference{
			ObjectType: "chronicle",
			ObjectId:   id.String(),
		},
		Builder: b,
	}
	return o
}

func (obj *ObjChronicle) Object() *v1.ObjectReference {
	return obj.Obj
}

func (obj *ObjChronicle) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.Object(),
		OptionalRelation: obj.OptionalRelation,
	}
}

func (obj *ObjChronicle) RelationAdmin() string {
	return "admin"
}

func (obj *ObjChronicle) RelationLog_capable() string {
	return "log_capable"
}

func (obj *ObjChronicle) RelationTechnical_admin() string {
	return "technical_admin"
}

// Admin schema.zed:11
// Relationship: chronicle:<id>#admin@user:<id>
func (obj *ObjChronicle) Admin(subs ...*ObjUser) *ObjChronicle {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationAdmin(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// Technical_admin schema.zed:12
// Relationship: chronicle:<id>#technical_admin@user:<id>
func (obj *ObjChronicle) Technical_admin(subs ...*ObjUser) *ObjChronicle {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationTechnical_admin(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// Log_capable schema.zed:16
// Relationship: chronicle:<id>#log_capable@user:<id>
func (obj *ObjChronicle) Log_capable(subs ...*ObjUser) *ObjChronicle {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationLog_capable(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// CanView_queue schema.zed:19
// Object: chronicle:<id>
func (obj *ObjChronicle) CanView_queue(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "view_queue", obj.Object()
}

// CanUpload_youtube schema.zed:21
// Object: chronicle:<id>
func (obj *ObjChronicle) CanUpload_youtube(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "upload_youtube", obj.Object()
}

// CanUpload_log schema.zed:23
// Object: chronicle:<id>
// Schema: permission upload_log = log_capable
func (obj *ObjChronicle) CanUpload_log(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "upload_log", obj.Object()
}

// CanCreate_user schema.zed:24
// Object: chronicle:<id>
// Schema: permission create_user = admin
func (obj *ObjChronicle) CanCreate_user(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "create_user", obj.Object()
}

type ObjLog_instance struct {
	Obj              *v1.ObjectReference
	OptionalRelation string
	Builder          *Builder
}

func (b *Builder) Log_instance(id fmt.Stringer) *ObjLog_instance {
	o := &ObjLog_instance{
		Obj: &v1.ObjectReference{
			ObjectType: "log_instance",
			ObjectId:   id.String(),
		},
		Builder: b,
	}
	return o
}

func (obj *ObjLog_instance) Object() *v1.ObjectReference {
	return obj.Obj
}

func (obj *ObjLog_instance) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.Object(),
		OptionalRelation: obj.OptionalRelation,
	}
}

func (obj *ObjLog_instance) RelationRaid_log() string {
	return "raid_log"
}

func (obj *ObjLog_instance) RelationTagged_by() string {
	return "tagged_by"
}

// Raid_log schema.zed:50
// Relationship: log_instance:<id>#raid_log@raid_log:<id>
func (obj *ObjLog_instance) Raid_log(subs ...*ObjRaid_log) *ObjLog_instance {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationRaid_log(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// Tagged_by schema.zed:51
// Relationship: log_instance:<id>#tagged_by@user:<id>
func (obj *ObjLog_instance) Tagged_by(subs ...*ObjUser) *ObjLog_instance {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationTagged_by(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// CanView schema.zed:54
// Object: log_instance:<id>
func (obj *ObjLog_instance) CanView(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "view", obj.Object()
}

// CanEdit schema.zed:55
// Object: log_instance:<id>
// Schema: permission edit = raid_log->edit
func (obj *ObjLog_instance) CanEdit(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "edit", obj.Object()
}

// CanTag schema.zed:56
// Object: log_instance:<id>
// Schema: permission tag = raid_log->edit + tagged_by
func (obj *ObjLog_instance) CanTag(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "tag", obj.Object()
}

type ObjRaid_log struct {
	Obj              *v1.ObjectReference
	OptionalRelation string
	Builder          *Builder
}

func (b *Builder) Raid_log(id fmt.Stringer) *ObjRaid_log {
	o := &ObjRaid_log{
		Obj: &v1.ObjectReference{
			ObjectType: "raid_log",
			ObjectId:   id.String(),
		},
		Builder: b,
	}
	return o
}

func (obj *ObjRaid_log) Object() *v1.ObjectReference {
	return obj.Obj
}

func (obj *ObjRaid_log) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.Object(),
		OptionalRelation: obj.OptionalRelation,
	}
}

func (obj *ObjRaid_log) RelationChronicle() string {
	return "chronicle"
}

func (obj *ObjRaid_log) RelationOwner() string {
	return "owner"
}

func (obj *ObjRaid_log) RelationPublic() string {
	return "public"
}

// Chronicle schema.zed:34
// Relationship: raid_log:<id>#chronicle@chronicle:<id>
func (obj *ObjRaid_log) Chronicle(subs ...*ObjChronicle) *ObjRaid_log {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationChronicle(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// Owner schema.zed:35
// Relationship: raid_log:<id>#owner@user:<id>
func (obj *ObjRaid_log) Owner(subs ...*ObjUser) *ObjRaid_log {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationOwner(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// PublicWildcard schema.zed:38
// Relationship: raid_log:<id>#public@user:*
func (obj *ObjRaid_log) PublicWildcard() *ObjRaid_log {
	obj.Builder.AddRelationship(v1.Relationship{
		Resource: obj.Obj,
		Relation: obj.RelationPublic(),
		Subject: &v1.SubjectReference{
			Object: &v1.ObjectReference{
				ObjectType: "user",
				ObjectId:   "*",
			},
			OptionalRelation: "",
		},
		OptionalCaveat: nil,
	})
	return obj
}

// CanView schema.zed:41
// Object: raid_log:<id>
func (obj *ObjRaid_log) CanView(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "view", obj.Object()
}

// CanReparse schema.zed:43
// Object: raid_log:<id>
// Schema: permission reparse = chronicle->admin
func (obj *ObjRaid_log) CanReparse(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "reparse", obj.Object()
}

// CanDelete schema.zed:46
// Object: raid_log:<id>
func (obj *ObjRaid_log) CanDelete(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "delete", obj.Object()
}

type ObjRiver_queue struct {
	Obj              *v1.ObjectReference
	OptionalRelation string
	Builder          *Builder
}

func (b *Builder) River_queue(id fmt.Stringer) *ObjRiver_queue {
	o := &ObjRiver_queue{
		Obj: &v1.ObjectReference{
			ObjectType: "river_queue",
			ObjectId:   id.String(),
		},
		Builder: b,
	}
	return o
}

func (obj *ObjRiver_queue) Object() *v1.ObjectReference {
	return obj.Obj
}

func (obj *ObjRiver_queue) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.Object(),
		OptionalRelation: obj.OptionalRelation,
	}
}

func (obj *ObjRiver_queue) RelationChronicle() string {
	return "chronicle"
}

// Chronicle schema.zed:28
// Relationship: river_queue:<id>#chronicle@chronicle:<id>
func (obj *ObjRiver_queue) Chronicle(subs ...*ObjChronicle) *ObjRiver_queue {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationChronicle(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// CanAccess schema.zed:30
// Object: river_queue:<id>
// Schema: permission access = chronicle->admin
func (obj *ObjRiver_queue) CanAccess(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "access", obj.Object()
}

type ObjUser struct {
	Obj              *v1.ObjectReference
	OptionalRelation string
	Builder          *Builder
}

func (b *Builder) User(id fmt.Stringer) *ObjUser {
	o := &ObjUser{
		Obj: &v1.ObjectReference{
			ObjectType: "user",
			ObjectId:   id.String(),
		},
		Builder: b,
	}
	return o
}

func (obj *ObjUser) Object() *v1.ObjectReference {
	return obj.Obj
}

func (obj *ObjUser) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.Object(),
		OptionalRelation: obj.OptionalRelation,
	}
}
