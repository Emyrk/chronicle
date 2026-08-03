/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

const projectRoot = process.cwd();

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setPublicDir(path.resolve(projectRoot, "../../frontend/chronicle/public"));
Config.overrideWebpackConfig((currentConfiguration) => {
  const configuration = enableTailwind(currentConfiguration);
  return {
    ...configuration,
    resolve: {
      ...configuration.resolve,
      alias: {
        ...configuration.resolve?.alias,
        "@": path.resolve(projectRoot, "../../frontend/chronicle/src"),
        "/c": path.resolve(projectRoot, "../../frontend/chronicle/public/c"),
        react: path.resolve(projectRoot, "node_modules/react"),
        "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
      },
    },
  };
});
