import { SERVER_NAME } from "@/config/serverCapabilities";

const OWNED_DOMAIN = "chronicleclassic.com";

function isOwnedNavigation(hostname: string): boolean {
  // icons.* is asset delivery, not user navigation.
  return (hostname === OWNED_DOMAIN || hostname.endsWith(`.${OWNED_DOMAIN}`)) && !hostname.startsWith("icons.");
}

/**
 * Tags a link to another Chronicle property with chr_* parameters so cross-site
 * navigation from blog posts can be measured. Relative (same-site) and
 * third-party links are returned unchanged.
 */
export function blogPostLink(postID: string, href: string, source: string = SERVER_NAME): string {
  if (!/^https?:\/\//.test(href)) {
    return href;
  }
  const url = new URL(href);
  if (!isOwnedNavigation(url.hostname)) {
    return href;
  }
  url.searchParams.set("chr_src", source);
  url.searchParams.set("chr_pos", "blog_post_inline");
  url.searchParams.set("chr_cmp", postID.replaceAll("-", "_"));
  return url.toString();
}
