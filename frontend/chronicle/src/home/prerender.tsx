import { StrictMode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InferenceRuntimeProvider } from "../features/chat/runtime";
import App from "../App";
import { Start2Page } from "../pages/Landing/Start2Page";
import { HomeBootstrapContext, type HomeBootstrap } from "./bootstrap";
import { SEO_PRODUCT_NAMES } from "../lib/seo";

export const PRODUCT_TOKEN = "CHRONICLE_HOME_PRODUCT_TOKEN";

async function render(bootstrap: HomeBootstrap) {
  const client = new QueryClient();
  const errors: unknown[] = [];
  try {
    const stream = await renderToReadableStream(
      <StrictMode><MemoryRouter initialEntries={["/"]}>
        <QueryClientProvider client={client}><InferenceRuntimeProvider>
          <HomeBootstrapContext.Provider value={bootstrap}><App homeLanding={bootstrap.foreverLanding ? Start2Page : undefined} /></HomeBootstrapContext.Provider>
        </InferenceRuntimeProvider></QueryClientProvider>
      </MemoryRouter></StrictMode>,
      { onError: (error) => { errors.push(error); } },
    );
    await stream.allReady;
    const html = await new Response(stream).text();
    if (errors.length) throw new AggregateError(errors, "Homepage SSR failed");
    return html;
  } finally {
    client.clear();
  }
}

export async function prerenderHome() {
  const pages: Record<string, string> = {};
  for (const named of [false, true]) {
    for (const state of ["open", "closed", "root-closed"] as const) {
      pages[`${named ? "named" : "generic"}-${state}`] = await render({
        productName: named ? PRODUCT_TOKEN : "",
        foreverLanding: false,
        uploadsDisabled: state !== "open",
        rootUploadsDisabled: state === "root-closed",
      });
    }
  }
  pages.forever = await render({
    productName: "WoW Forever",
    foreverLanding: true,
    uploadsDisabled: true,
    rootUploadsDisabled: false,
  });
  return { products: SEO_PRODUCT_NAMES, pages };
}
