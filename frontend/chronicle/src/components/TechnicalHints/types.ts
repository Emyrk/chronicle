export type TechnicalHintKind = "tip" | "panel" | "blog";

/** Where the hinted feature lives, so cards can say where to try it. */
export type TechnicalHintContext = "instance";

export interface TechnicalHint {
  id: string;
  kind: TechnicalHintKind;
  context?: TechnicalHintContext;
  title: string;
  body: string;
  href?: string;
  action_label?: string;
  icon?: string;
  image_url?: string;
  panel?: string;
  blog_id?: string;
  tags?: string[];
  generated_at?: string;
  expires_at?: string;
}

export interface TechnicalHintsResponse {
  version: string;
  generated_at: string;
  refresh_after: string;
  payloads: TechnicalHint[];
}
