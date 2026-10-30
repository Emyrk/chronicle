// Renders a 1200x630 HTML social card to JPEG: node render-og.cjs <in.html> <out.jpg>
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const [input, output] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`file://${path.resolve(input)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, type: "jpeg", quality: 88 });
  await browser.close();
})();
