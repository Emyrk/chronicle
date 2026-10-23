export type TechnicalHintKind = "tip" | "panel" | "blog" | "community_fact";

export interface TechnicalHint {
  id: string;
  kind: TechnicalHintKind;
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
