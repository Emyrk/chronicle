import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, type AppProps } from "./App";
import "./index.css";

function readPrerenderState(): Pick<AppProps, "initialServers" | "copyrightYear"> {
  const element = document.getElementById("chronicle-prerender-state");
  if (!element?.textContent) return {};

  try {
    return JSON.parse(element.textContent) as Pick<
      AppProps,
      "initialServers" | "copyrightYear"
    >;
  } catch {
    return {};
  }
}

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App pathname={window.location.pathname} {...readPrerenderState()} />
  </StrictMode>
);

if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
