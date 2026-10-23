import generalTipsJSON from "../../../../../assets/turtle/generated/general-tips.json";
import panelHintsJSON from "../../../../../assets/turtle/generated/panel-hints.json";
import { BLOG_POSTS, blogPostPath } from "@/blog/blogRegistry";
import type { TechnicalHint, TechnicalHintsResponse } from "./types";

type GeneralTipAsset = { id: string; content: string };
type PanelHintAsset = { id: string; panelID: string; content: string };

function humanize(value: string): string {
  const words = value.replaceAll(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const STATIC_TECHNICAL_HINTS: readonly TechnicalHint[] = [
  ...(generalTipsJSON as GeneralTipAsset[]).map((tip): TechnicalHint => ({
    id: `tip-${tip.id}`,
    kind: "tip",
    title: humanize(tip.id),
    body: tip.content,
    href: "/technical#chronicle-tips",
    tags: ["tip"],
  })),
  ...(panelHintsJSON as PanelHintAsset[]).map((hint): TechnicalHint => ({
    id: `panel-${hint.id}`,
    kind: "panel",
    title: humanize(hint.panelID),
    body: hint.content,
    href: "/technical#panel-insights",
    action_label: "See panel insights",
    panel: hint.panelID,
    tags: ["panel", hint.panelID],
  })),
  ...BLOG_POSTS.map((post): TechnicalHint => ({
    id: `blog-${post.id}`,
    kind: "blog",
    title: post.title,
    body: post.description,
    href: blogPostPath(post.id),
    action_label: "Read the article",
    icon: post.icon,
    blog_id: post.id,
    tags: ["blog", post.tag],
  })),
];

export function mergeTechnicalHints(
  dynamic: TechnicalHintsResponse | undefined,
): TechnicalHintsResponse {
  const payloads = new Map(STATIC_TECHNICAL_HINTS.map((hint) => [hint.id, hint]));
  for (const hint of dynamic?.payloads ?? []) payloads.set(hint.id, hint);

  return {
    version: dynamic?.version ?? "static-v1",
    generated_at: dynamic?.generated_at ?? new Date(0).toISOString(),
    refresh_after: dynamic?.refresh_after ?? new Date(0).toISOString(),
    payloads: [...payloads.values()],
  };
}
