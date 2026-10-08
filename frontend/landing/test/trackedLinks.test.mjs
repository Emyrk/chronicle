import assert from "node:assert/strict";
import test from "node:test";
import { trackedTenantUrl } from "../src/trackedLinks.ts";

test("adds landing-page tracking to a tenant URL", () => {
  assert.equal(
    trackedTenantUrl("https://turtle.chronicleclassic.com", "server_card"),
    "https://turtle.chronicleclassic.com/?chr_src=main&chr_pos=server_card",
  );
});

test("preserves destination query parameters and fragments", () => {
  assert.equal(
    trackedTenantUrl(
      "https://forever.chronicleclassic.com/upload?view=compact#form",
      "featured_server_upload",
    ),
    "https://forever.chronicleclassic.com/upload?view=compact&chr_src=main&chr_pos=featured_server_upload#form",
  );
});

test("replaces stale landing tracking without changing acquisition UTMs", () => {
  assert.equal(
    trackedTenantUrl(
      "https://example.com/?utm_source=discord&utm_medium=community&utm_campaign=launch&chr_src=wiki&chr_pos=footer",
      "server_card",
    ),
    "https://example.com/?utm_source=discord&utm_medium=community&utm_campaign=launch&chr_src=main&chr_pos=server_card",
  );
});
