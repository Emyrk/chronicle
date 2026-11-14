package snapshot

import (
	"context"
	"strings"
	"testing"
)

func fixtureIdentity() Compatibility {
	return Compatibility{DatasetID: "9c716540-587a-4bf3-bd90-739c01a6ce31", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: "1.12a-cc-addon", Flavor: "vanilla"}
}
func TestCompatibilityStrict(t *testing.T) {
	t.Parallel()
	identity := fixtureIdentity()
	if err := identity.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*Compatibility){
		func(c *Compatibility) { c.DatasetID = "" },
		func(c *Compatibility) { c.DatasetID = "00000000-0000-0000-0000-000000000000" },
		func(c *Compatibility) { c.DatasetID = strings.ToUpper(c.DatasetID) },
		func(c *Compatibility) { c.DatasetRevision = 0 },
		func(c *Compatibility) { c.DatasetRevision = -1 },
		func(c *Compatibility) { c.BuildIdentity = "unknown" },
		func(c *Compatibility) { c.BuildIdentity = strings.Repeat("a", 64) },
		func(c *Compatibility) { c.BuildIdentity = "sha256:" + strings.Repeat("A", 64) },
		func(c *Compatibility) { c.BuildIdentity = "sha256:" + strings.Repeat("x", 64) },
		func(c *Compatibility) { c.Format = "" },
		func(c *Compatibility) { c.Flavor = " " },
	} {
		invalid := identity
		change(&invalid)
		if err := invalid.Validate(); err == nil {
			t.Fatalf("accepted invalid identity: %+v", invalid)
		}
	}
	for _, change := range []func(*Compatibility){
		func(c *Compatibility) { c.DatasetID = "9c716540-587a-4bf3-bd90-739c01a6ce32" },
		func(c *Compatibility) { c.DatasetRevision++ },
		func(c *Compatibility) { c.BuildIdentity = "sha256:" + strings.Repeat("b", 64) },
		func(c *Compatibility) { c.Format = "3.3.5a-cc-addon" },
		func(c *Compatibility) { c.Flavor = "wrath" },
	} {
		other := identity
		change(&other)
		if err := identity.Check(other); err == nil {
			t.Fatalf("accepted mismatch: %+v", other)
		}
	}
	if err := identity.Check(identity); err != nil {
		t.Fatal(err)
	}
}
func TestContextBindingCopiesIdentity(t *testing.T) {
	t.Parallel()
	identity := fixtureIdentity()
	ctx := WithCompatibility(context.Background(), identity)
	identity.DatasetRevision++
	got, ok := FromContext(ctx)
	if !ok || got != fixtureIdentity() {
		t.Fatal("context identity was mutated")
	}
	if _, ok := FromContext(context.Background()); ok {
		t.Fatal("missing binding accepted")
	}
}
