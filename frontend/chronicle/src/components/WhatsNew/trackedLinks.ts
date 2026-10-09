import { SERVER_NAME } from "@/config/serverCapabilities";

export type WhatsNewLinkPosition = "whats_new_primary" | "whats_new_archive";

export function whatsNewLink(
  href: string,
  position: WhatsNewLinkPosition,
  campaign: string,
  source: string = SERVER_NAME,
): string {
  const url = new URL(href, "https://chronicle.local");
  url.searchParams.set("chr_src", source);
  url.searchParams.set("chr_pos", position);
  url.searchParams.set("chr_cmp", campaign.replaceAll("-", "_"));
  return `${url.pathname}${url.search}${url.hash}`;
}
