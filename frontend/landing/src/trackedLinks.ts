export type TenantLinkPosition =
  | "featured_server_logs"
  | "featured_server_upload"
  | "server_card";

export function trackedTenantUrl(
  destination: string,
  position: TenantLinkPosition,
): string {
  const url = new URL(destination);
  url.searchParams.set("chr_src", "main");
  url.searchParams.set("chr_pos", position);
  return url.toString();
}
