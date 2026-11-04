import { renderToString } from "react-dom/server";
import { App } from "./App";
import { DISCOVERY_URLS, SERVERS } from "./data/servers";
import { discoverServers } from "./hooks/useDiscovery";
import type { ServerEntry } from "./types";

export interface PrerenderResult {
  html: string;
  state: {
    initialServers: ServerEntry[];
    copyrightYear: number;
  };
  structuredData: Record<string, unknown>;
}

export async function prerenderHome(): Promise<PrerenderResult> {
  const initialServers = await discoverServers(SERVERS, DISCOVERY_URLS);
  const copyrightYear = new Date().getUTCFullYear();

  return {
    html: renderToString(
      <App
        pathname="/"
        initialServers={initialServers}
        copyrightYear={copyrightYear}
      />,
    ),
    state: { initialServers, copyrightYear },
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: "Chronicle",
          url: "https://chronicleclassic.com/",
          description:
            "Combat log analysis for Classic World of Warcraft private servers.",
        },
        {
          "@type": "ItemList",
          name: "Classic WoW servers supported by Chronicle",
          numberOfItems: initialServers.length,
          itemListElement: initialServers.map((server, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: server.name,
            url: server.chronicleUrl,
          })),
        },
      ],
    },
  };
}
