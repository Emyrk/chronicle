import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
    "@storybook/addon-themes"
  ],
  "framework": "@storybook/react-vite",
  // Boss minis and local dungeon meshes, as `pnpm dev` serves them.
  "staticDirs": [
    "../public",
    // Opt-in local replay experiments; logs and extracted meshes stay outside Git.
    ...(process.env.CHRONICLE_STORY_ASSETS
      ? [{ from: process.env.CHRONICLE_STORY_ASSETS, to: "/dalaran-demo" }]
      : []),
  ],
};
export default config;