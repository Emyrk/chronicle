import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { DISCOVERY_URLS } from "./src/data/servers";

const adsenseClientIDPattern = /^ca-pub-[0-9]+$/;

function adsenseVerification(clientID: string): Plugin {
  if (clientID && !adsenseClientIDPattern.test(clientID)) {
    throw new Error("CHRONICLE_ADSENSE_CLIENT_ID must match ca-pub- followed by digits");
  }

  return {
    name: "chronicle-adsense-verification",
    transformIndexHtml: clientID
      ? {
          order: "pre",
          handler: () => [
            {
              tag: "meta",
              attrs: { name: "google-adsense-account", content: clientID },
              injectTo: "head",
            },
          ],
        }
      : undefined,
  };
}

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "CHRONICLE_");

  return {
    plugins: [
      react(),
      tailwindcss(),
      adsenseVerification(env.CHRONICLE_ADSENSE_CLIENT_ID ?? ""),
    ],
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
          selfHosting: "self-hosting/index.html",
          support: "support/index.html",
          privacy: "privacy/index.html",
        },
      },
    },
  };
});
