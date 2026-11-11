import { readFile, writeFile } from "node:fs/promises";
import { prerenderHome } from "../.home-prerender/prerender.js";

// Go fills this root only for /. Keep the ordinary Vite shell usable in dev/preview.
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
if (!html.includes('<div id="root"></div>')) throw new Error("Missing homepage root insertion point");
await writeFile(new URL("../dist/home-manifest.json", import.meta.url), JSON.stringify(await prerenderHome()));
