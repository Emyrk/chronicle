import type { GuildInfo, GuildPanelPosition } from "@/api/typesGenerated";

export interface GuildPanelDefinition<TConfig = unknown> {
  type: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };

  // Config schema for editor
  configSchema: ConfigField[];
  defaultConfig: TConfig;

  // Render function
  render: (props: GuildPanelRenderProps<TConfig>) => React.ReactNode;
}

export interface GuildPanelRenderProps<TConfig> {
  guild: GuildInfo;
  config: TConfig;
  position: GuildPanelPosition;
  isEditing: boolean;
}

export interface ConfigField {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "textarea";
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: unknown;
}

// Panel instance as stored/rendered
export interface PanelInstance {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: GuildPanelPosition;
}
