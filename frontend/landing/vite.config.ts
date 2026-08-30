import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { DISCOVERY_URLS } from "./src/data/servers";

const discoveryProxies = Object.fromEntries(
  DISCOVERY_URLS.map((url) => {
    const hostname = new URL(url).hostname;
    return [
      `/__discovery/${hostname}`,
      {
        target: url,
        changeOrigin: true,
        headers: {
          Origin: "https://chronicleclassic.com",
          Referer: "https://chronicleclassic.com/",
        },
        rewrite: () => "/api/v1/discovery",
      } satisfies ProxyOptions,
    ];
  }),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Discovery deployments do not need browser CORS configuration during local development.
    proxy: discoveryProxies,
  },
  // Relative base so the same build works at both:
  //   - the custom domain root (https://chronicleclassic.com/)
  //   - the github.io subpath (https://<user>.github.io/chronicle/)
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        support: "support/index.html",
      },
    },
  },
});
