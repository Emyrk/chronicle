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
  onConfigChange?: (config: Partial<TConfig>) => void;
}

export interface ConfigField {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "textarea" | "custom";
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: unknown;
  /** Renders the editor for a "custom" field inside the config modal. */
  render?: (value: unknown, onChange: (value: unknown) => void) => React.ReactNode;
}

// Panel instance as stored/rendered
export interface PanelInstance {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: GuildPanelPosition;
}
