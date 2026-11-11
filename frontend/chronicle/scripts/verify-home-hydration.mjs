import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Reuse the browser provider's installed Playwright rather than add a second copy.
const require = createRequire(import.meta.url);
const browserRequire = createRequire(require.resolve("@vitest/browser-playwright"));
const { chromium } = browserRequire("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) for (const [variant, expected] of [["unknown", "Every raid tells a story."], ["epoch", "Epoch Reborn Combat Logs"], ["warmane", "Warmane Combat Logs"], ["forever", "WoW Forever Combat Logs"], ["forever-disabled", "WoW Forever Combat Logs"]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    await page.addInitScript(() => {
      localStorage.setItem("landing-hero-clip", "1");
      localStorage.setItem("homeSpotlightIdx", "3");
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydration|hydrating|did not match|Minified React error/i.test(message.text())) errors.push(message.text());
    });
    let releaseScripts;
    const scriptsReady = new Promise((resolve) => { releaseScripts = resolve; });
    await page.route("**/*.js", async (route) => { await scriptsReady; await route.continue(); });
    await page.route("**/api/**", (route) => {
      if (new URL(route.request().url()).pathname === "/api/v1/site-config") {
        return route.fulfill({ json: {
          dataset_flavor: variant.startsWith("forever") ? ["wow-forever"] : ["epoch", "warmane"].includes(variant) ? [variant] : [],
          forever_landing_enabled: variant === "forever",
          branding: { display_name: "Hydrated Test Tenant" },
        } });
      }
      return route.abort();
    });
    await page.goto(`${process.argv[2]}/?variant=${variant}`, { waitUntil: "commit" });
    await page.waitForSelector("h1");
    assert.ok((await page.locator("h1").textContent()).includes(expected));
    assert.ok(await page.locator('a[href="/download"]').count());
    await page.evaluate(() => {
      window.originalHomeHeading = document.querySelector("h1");
    });
    releaseScripts();
    await page.waitForFunction(() => Object.keys(document.querySelector("h1")).some((key) => key.startsWith("__reactFiber$")));
    assert.equal(await page.evaluate(() => window.originalHomeHeading === document.querySelector("h1")), true, `${variant}: heading was replaced rather than hydrated: ${errors.join("\n")}`);
    await page.getByText("Hydrated Test Tenant", { exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => window.originalHomeHeading === document.querySelector("h1")), true, `${variant}: live configuration replaced the heading`);
    if (variant === "forever") {
      await page.waitForFunction(() => document.querySelector('img[alt="3D replay of a dungeon boss fight"]')?.getAttribute("src") === document.documentElement.dataset.heroPoster);
    }
    assert.deepEqual(errors, [], `${variant}: browser errors`);
    console.log(`${variant} at ${viewport.width}px: meaningful HTML, guide link, preserved heading DOM, no hydration errors`);
    if (variant === "unknown") {
      await page.locator('a[href="/download"]').first().click();
      await page.waitForURL("**/download");
      await page.waitForFunction(() => document.querySelector("h1") && document.querySelector("h1") !== window.originalHomeHeading);
      await page.goto(`${process.argv[2]}/blog`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "What's New", exact: true }).waitFor();
      await page.waitForFunction(() => Object.keys(document.querySelector("h1")).some((key) => key.startsWith("__reactFiber$")));
      assert.deepEqual(errors, [], "download navigation and blog hydration errors");
      console.log("download navigation and separate blog hydration remain working");
    }
    await page.close();
  }
} finally {
  await browser.close();
}
