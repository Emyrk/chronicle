/// <reference types="vitest/config" />
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { localProxyHeaders } from './src/config/viteProxy';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Proxy helper that rewrites the Host header to preserve the subdomain
// while targeting the backend port. e.g. epoch.localhost:5173 → epoch.localhost:4000
function backendProxy(): ProxyOptions {
  const target = process.env.HOST || "http://localhost:4000";
  const isRemote = !target.includes("localhost");
  const targetUrl = new URL(target);
  const rewriteHeaders = (
    proxyReq: { setHeader: (name: string, value: string) => void },
    host: string | undefined,
    origin: string | undefined,
    websocket = false,
  ) => {
    if (isRemote) {
      // Fake browser headers to bypass "only browser connections allowed"
      proxyReq.setHeader('Host', targetUrl.host);
      proxyReq.setHeader('Origin', target.replace(/\/$/, ''));
      proxyReq.setHeader('Referer', target);
    } else if (host) {
      const headers = localProxyHeaders(host, origin, targetUrl.protocol, websocket);
      proxyReq.setHeader('Host', headers.host);
      // Same-origin checks compare Origin with the rewritten backend Host.
      // Only rewrite a browser Origin that matched the incoming Vite Host.
      if (headers.origin) proxyReq.setHeader('Origin', headers.origin);
    }
  };

  return {
    target,
    secure: false,
    changeOrigin: isRemote,
    ws: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => rewriteHeaders(proxyReq, req.headers.host, req.headers.origin));
      proxy.on('proxyReqWs', (proxyReq, req) => rewriteHeaders(proxyReq, req.headers.host, req.headers.origin, true));
    },
  };
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  define: {
    'import.meta.env.VITE_SERVER_NAME': JSON.stringify(process.env.SERVER || 'turtle'),
    'import.meta.env.CHRONICLE_PREVIEW_ADS': JSON.stringify(process.env.CHRONICLE_PREVIEW_ADS === 'true'),
    'import.meta.env.CHRONICLE_PREVIEW_ADS_DEMO': JSON.stringify(process.env.CHRONICLE_PREVIEW_ADS_DEMO === 'true'),
  },
  plugins: [react({
    babel: {
      plugins: [['babel-plugin-react-compiler']]
    }
  }), tailwindcss(), {
    name: 'react-scan-dev',
    transformIndexHtml(_html, ctx) {
      // eslint-disable-next-line no-constant-condition -- Keep the React Scan hook available but disabled by default.
      if (ctx.server && false) {
        return [{
          tag: 'script',
          attrs: { src: 'https://unpkg.com/react-scan/dist/auto.global.js' },
          injectTo: 'head-prepend',
        }];
      }
    },
  }],
  optimizeDeps: {
    include: ["fengari", "fflate"],
  },
  resolve: {
    alias: {
      // Server-specific generated constants (must come before generic "@")
      "@/constants/dbmem": path.resolve(__dirname, `src/constants/dbmem/${process.env.SERVER || 'turtle'}`),
      // Server-specific spell test vectors
      "@testdata/spellTestVectors": path.resolve(__dirname, `src/api/testdata/spellTestVectors.${process.env.SERVER || 'turtle'}.generated`),
      // Shared custom-panel SDK package
      "@emyrk/chronicle-panel-sdk/v1": path.resolve(__dirname, "../chronicle-panel-sdk/src/v1/index.ts"),
      // Shared pure tooltip renderer package
      "@emyrk/wow-tooltip-renderer": path.resolve(__dirname, "../wow-tooltip-renderer/src/index.ts"),
      "@": path.resolve(__dirname, "src"),
    }
  },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": backendProxy(),
      "/auth": backendProxy(),
      "/static": backendProxy(),
    }
  },
  test: {
    projects: [
      // Unit tests (Node environment, fast)
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          environment: 'node',
        }
      },
      // Storybook component tests (browser)
      {
        extends: true,
        plugins: [
        // The plugin will run tests for the stories defined in your Storybook config
        // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
        storybookTest({
          configDir: path.join(dirname, '.storybook')
        })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{
              browser: 'chromium'
            }]
          },
          setupFiles: ['.storybook/vitest.setup.ts']
        }
      }
    ]
  }
});