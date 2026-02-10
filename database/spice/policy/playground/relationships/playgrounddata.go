package relationships

import (
	"github.com/Emyrk/chronicle/database/spice/policy"
)

func GenerateRelationships() {
	var (
		// Using the global playground relationships, so we can export to yaml later.
		platform = Playground.GlobalChronicle()

		root = Playground.User(policy.String("root"))
		// This is an incomplete list. Using real names to use intuitive groupings.
		//ammar     = Playground.User(policy.String("ammar"))
		//camilla   = Playground.User(policy.String("camilla"))
		//colin     = Playground.User(policy.String("colin"))
		//dean      = Playground.User(policy.String("dean"))
		//elliot    = Playground.User(policy.String("elliot"))
		//eric      = Playground.User(policy.String("eric"))
		//jon       = Playground.User(policy.String("jon"))
		//katherine = Playground.User(policy.String("katherine"))
		//kayla     = Playground.User(policy.String("kayla"))
		//kira      = Playground.User(policy.String("kira"))
		//kyle      = Playground.User(policy.String("kyle"))
		//shark     = Playground.User(policy.String("shark"))
		//steven    = Playground.User(policy.String("steven"))
	)

	// Add platform roles
	platform.Admin(root)

	// Groups
	// ├── everyone
	// ├── hr
	// ├── finance
	// ├── cost-control
	// ├── engineers
	// ├── marketing
	// └── sales

	// └── cost-control
	//      ├── developers
	//      └── technical

	//groupEveryone := Playground.Group(policy.String("everyone")).MemberWildcard()
	//groupHR := Playground.Group(policy.String("hr")).MemberUser(camilla)
	//groupFinance := Playground.Group(policy.String("finance")).MemberUser(ammar, kyle, shark)
	//groupCostControl := Playground.Group(policy.String("cost-control")).MemberUser(ammar, kyle, dean, colin)
	//groupEngineers := Playground.Group(policy.String("engineers")).MemberUser(ammar, colin, dean, jon, kayla, kira, kyle, steven)
	//groupMarketing := Playground.Group(policy.String("marketing")).MemberUser(katherine, ammar)
	//groupSales := Playground.Group(policy.String("sales")).MemberUser(shark, eric)
	//var _ = groupEveryone
	//
	//// Organizations
	//companyOrganization := Playground.Organization(policy.String("company")).
	//	Platform(platform).
	//	// Primitive membership
	//	MemberGroup(groupHR, groupFinance, groupMarketing, groupSales, groupEngineers, groupCostControl).
	//	// Cost control can see all workspaces
	//	Workspace_viewerGroup(groupCostControl).
	//	Workspace_editorGroup(groupCostControl).
	//	// Engineers & Sales can create workspaces
	//	Workspace_creatorGroup(groupEngineers, groupSales).
	//	// External person who can also creaet workspaces
	//	Workspace_creatorUser(elliot).
	//	Template_viewerGroup(groupCostControl, groupEngineers, groupSales)
	//
	//// Make some resources!
	//devTemplate := Playground.Template(policy.String("dev-template")).
	//	Organization(companyOrganization)
	//devVersion := Playground.Template_version(policy.String("active")).Template(devTemplate)
	//
	//Playground.AssertTrue(devTemplate.CanUse, elliot, groupHR.AsAnyMembership())
	//var _ = devVersion
	//
	//// Steven will create a workspace.
	//stevenWorkspace := WorkspaceWithDeps("steven-workspace", companyOrganization, devTemplate, steven)
	//// Some extra assertions
	//Playground.AssertTrue(stevenWorkspace.CanView, ammar, kyle)
	//Playground.AssertFalse(stevenWorkspace.CanView, camilla, jon)
	//Playground.AssertTrue(stevenWorkspace.CanEdit, steven)
	//Playground.AssertFalse(stevenWorkspace.CanSsh, dean)
	//
	//// Validations enumerate who can do the given action.
	//Playground.Validate(stevenWorkspace.CanView, stevenWorkspace.CanSsh, stevenWorkspace.CanEdit)
	//
	//// Add a custom role
	//templateAuditRole := Playground.Org_role(policy.String("template_auditor")).
	//	Organization(companyOrganization).
	//	MemberGroup(groupCostControl)
	//
	//companyOrganization.
	//	Template_editorOrg_role(templateAuditRole).
	//	Template_insights_viewerOrg_role(templateAuditRole)

}

// createWorkspace
//   - actor: The user creating the workspace. This user will be assigned as the owner.
//   - team: The team the workspace is being created for.
//   - template: The template version the workspace is being created from.
//   - provisioner: (in prod this might be tags??) The provisioner to provision the workspace.
//
// Creating a workspace is the process of a Team creating a workspace and assigning
// a user permissions.
// Perm checks:
//   - Can a user create a workspace for a given team?
//   - Can the team provision the workspace with the template?
//   - Can the team use the selected provisioner to provision the workspace? (TODO, rethink this)
//func testCreateWorkspace(actor *ObjUser, team *ObjOrganization, version *ObjTemplate_version) {
//
//}
