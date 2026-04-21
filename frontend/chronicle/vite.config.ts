/// <reference types="vitest/config" />
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  define: {
    'import.meta.env.VITE_SERVER_NAME': JSON.stringify(process.env.SERVER || 'turtle'),
  },
  plugins: [react({
    babel: {
      plugins: [['babel-plugin-react-compiler']]
    }
  }), tailwindcss(), {
    name: 'react-scan-dev',
    transformIndexHtml(_html, ctx) {
      if (ctx.server && false) {
        return [{
          tag: 'script',
          attrs: { src: 'https://unpkg.com/react-scan/dist/auto.global.js' },
          injectTo: 'head-prepend',
        }];
      }
    },
  }],
  resolve: {
    alias: {
      // Server-specific generated constants (must come before generic "@")
      "@/constants/dbmem": path.resolve(__dirname, `src/constants/dbmem/${process.env.SERVER || 'turtle'}`),
      // Server-specific spell test vectors
      "@testdata/spellTestVectors": path.resolve(__dirname, `src/api/testdata/spellTestVectors.${process.env.SERVER || 'turtle'}.generated`),
      "@": path.resolve(__dirname, "src"),
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:4000",
      "/auth": "http://localhost:4000",
      "/static": "http://localhost:4000",
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