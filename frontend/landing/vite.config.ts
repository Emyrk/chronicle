import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { DISCOVERY_URLS } from "./src/data/servers";

const nitroPaySiteIDPattern = /^[0-9]+$/;

function nitroPay(siteID: string): Plugin {
  if (siteID && !nitroPaySiteIDPattern.test(siteID)) {
    throw new Error("CHRONICLE_NITROPAY_SITE_ID must contain only digits");
  }

  return {
    name: "chronicle-nitropay",
    transformIndexHtml: siteID
      ? {
          order: "pre",
          handler: () => [
            {
              tag: "script",
              attrs: { "data-cfasync": "false" },
              children:
                "window.nitroAds=window.nitroAds||{createAd:function(){return new Promise(function(resolve){window.nitroAds.queue.push(['createAd',arguments,resolve])})},queue:[]};",
              injectTo: "head",
            },
            {
              tag: "script",
              attrs: {
                async: true,
                "data-cfasync": "false",
                src: `https://s.nitropay.com/ads-${siteID}.js`,
              },
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
    define: {
      "import.meta.env.CHRONICLE_NITROPAY_SITE_ID": JSON.stringify(
        env.CHRONICLE_NITROPAY_SITE_ID ?? "",
      ),
    },
    plugins: [
      react(),
      tailwindcss(),
      nitroPay(env.CHRONICLE_NITROPAY_SITE_ID ?? ""),
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
          ads: "ads/index.html",
          privacy: "privacy/index.html",
          warcraftLogs: "warcraft-logs/index.html",
        },
      },
    },
  };
});
