import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectGuidePackageFiles } from "../../../../scripts/guide-package-files";

describe("guide package source collection", () => {
  it("includes package-local Lua modules and declared assets, not source-only data", async () => {
    const source = await mkdtemp(join(tmpdir(), "chronicle-guide-"));
    try {
      await mkdir(join(source, "helpers"));
      await mkdir(join(source, "assets"));
      await writeFile(join(source, "main.lua"), `return require("helpers.ui")`);
      await writeFile(join(source, "helpers", "ui.lua"), "return {};");
      await writeFile(join(source, "assets", "icon.png"), new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
      await writeFile(join(source, "entrance.json"), "{}");
      const files = await collectGuidePackageFiles(source, "main.lua", ["assets/icon.png"]);
      expect(Object.keys(files).sort()).toEqual(["assets/icon.png", "helpers/ui.lua", "main.lua"]);
      expect(() => new TextDecoder().decode(files["helpers/ui.lua"])).not.toThrow();
      await expect(collectGuidePackageFiles(source, "main.lua", ["assets/missing.png"])).rejects.toThrow(/Missing/);
      await symlink(join(source, "main.lua"), join(source, "linked.lua"));
      await expect(collectGuidePackageFiles(source, "main.lua", [])).rejects.toThrow(/Unsupported/);
    } finally {
      await rm(source, { recursive: true, force: true });
    }
  });
});
