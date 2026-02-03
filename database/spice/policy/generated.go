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

// Log_capable schema.zed:12
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

// CanCreate_user schema.zed:14
// Object: chronicle:<id>
// Schema: permission create_user = admin
func (obj *ObjChronicle) CanCreate_user(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "create_user", obj.Object()
}

type ObjInstance struct {
	Obj              *v1.ObjectReference
	OptionalRelation string
	Builder          *Builder
}

func (b *Builder) Instance(id fmt.Stringer) *ObjInstance {
	o := &ObjInstance{
		Obj: &v1.ObjectReference{
			ObjectType: "instance",
			ObjectId:   id.String(),
		},
		Builder: b,
	}
	return o
}

func (obj *ObjInstance) Object() *v1.ObjectReference {
	return obj.Obj
}

func (obj *ObjInstance) AsSubject() *v1.SubjectReference {
	return &v1.SubjectReference{
		Object:           obj.Object(),
		OptionalRelation: obj.OptionalRelation,
	}
}

func (obj *ObjInstance) RelationRaid_log() string {
	return "raid_log"
}

func (obj *ObjInstance) RelationTagged_by() string {
	return "tagged_by"
}

// Raid_log schema.zed:41
// Relationship: instance:<id>#raid_log@raid_log:<id>
func (obj *ObjInstance) Raid_log(subs ...*ObjRaid_log) *ObjInstance {
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

// Tagged_by schema.zed:42
// Relationship: instance:<id>#tagged_by@user:<id>
func (obj *ObjInstance) Tagged_by(subs ...*ObjUser) *ObjInstance {
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

// CanView schema.zed:45
// Object: instance:<id>
func (obj *ObjInstance) CanView(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "view", obj.Object()
}

// CanEdit schema.zed:46
// Object: instance:<id>
// Schema: permission edit = raid_log->edit
func (obj *ObjInstance) CanEdit(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "edit", obj.Object()
}

// CanTag schema.zed:47
// Object: instance:<id>
// Schema: permission tag = raid_log->edit + tagged_by
func (obj *ObjInstance) CanTag(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
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

func (obj *ObjRaid_log) RelationPublic() string {
	return "public"
}

func (obj *ObjRaid_log) RelationUploader() string {
	return "uploader"
}

// Chronicle schema.zed:24
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

// Uploader schema.zed:25
// Relationship: raid_log:<id>#uploader@user:<id>
func (obj *ObjRaid_log) Uploader(subs ...*ObjUser) *ObjRaid_log {
	for i := range subs {
		sub := subs[i]
		obj.Builder.AddRelationship(v1.Relationship{
			Resource: obj.Obj,
			Relation: obj.RelationUploader(),
			Subject: &v1.SubjectReference{
				Object:           sub.Obj,
				OptionalRelation: "",
			},
			OptionalCaveat: nil,
		})
	}
	return obj
}

// PublicWildcard schema.zed:28
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

// CanView schema.zed:31
// Object: raid_log:<id>
func (obj *ObjRaid_log) CanView(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "view", obj.Object()
}

// CanInsert schema.zed:32
// Object: raid_log:<id>
// Schema: permission insert = chronicle->log_capable
func (obj *ObjRaid_log) CanInsert(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "insert", obj.Object()
}

// CanReparse schema.zed:34
// Object: raid_log:<id>
// Schema: permission reparse = chronicle->admin
func (obj *ObjRaid_log) CanReparse(ctx context.Context) (context.Context, string, *v1.ObjectReference) {
	return ctx, "reparse", obj.Object()
}

// CanDelete schema.zed:37
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

// Chronicle schema.zed:18
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

// CanAccess schema.zed:20
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
