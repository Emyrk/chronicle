import { useState, useCallback } from "react";
import type { GuildPagePanel, DeviceVisibility } from "@/api/typesGenerated";
import { getPanelDefinition } from "../panels/registry";
import type { ConfigField } from "../panels/types";
import { X, Monitor, Smartphone, Globe, Paintbrush, Settings } from "lucide-react";

// Style config stored in panel.config._style
export interface PanelStyle {
  panelName: string;
  showHeader: boolean;
  background: "inherit" | "transparent" | "custom";
  backgroundColor: string; // rgba string for custom
}

export const DEFAULT_PANEL_STYLE: PanelStyle = {
  panelName: "",
  showHeader: true,
  background: "inherit",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
};

export function getPanelStyle(config: Record<string, unknown>): PanelStyle {
  const raw = config._style as Partial<PanelStyle> | undefined;
  return { ...DEFAULT_PANEL_STYLE, ...raw };
}

interface PanelConfigModalProps {
  panel: GuildPagePanel | null;
  onSave: (config: Record<string, unknown>, visibility: DeviceVisibility) => void;
  onClose: () => void;
}

export function PanelConfigModal({ panel, onSave, onClose }: PanelConfigModalProps) {
  if (!panel) return null;

  const definition = getPanelDefinition(panel.panel_type);
  if (!definition) return null;

  return (
    <PanelConfigModalInner
      key={panel.id}
      panel={panel}
      definition={definition}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

type ModalTab = "settings" | "style";

interface InnerProps {
  panel: GuildPagePanel;
  definition: NonNullable<ReturnType<typeof getPanelDefinition>>;
  onSave: (config: Record<string, unknown>, visibility: DeviceVisibility) => void;
  onClose: () => void;
}

function PanelConfigModalInner({ panel, definition, onSave, onClose }: InnerProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>("settings");
  const [config, setConfig] = useState<Record<string, unknown>>(panel.config || {});
  const [visibility, setVisibility] = useState<DeviceVisibility>(panel.visibility || "all");
  const [style, setStyle] = useState<PanelStyle>(() => getPanelStyle(panel.config || {}));

  const handleChange = (name: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleStyleChange = useCallback(<K extends keyof PanelStyle>(key: K, value: PanelStyle[K]) => {
    setStyle((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...config, _style: style }, visibility);
    onClose();
  };

  const renderField = (field: ConfigField) => {
    const value = config[field.name] ?? field.defaultValue;

    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={(value as number) || 0}
            onChange={(e) => handleChange(field.name, parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        );
      case "select":
        return (
          <select
            value={(value as string) || ""}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      case "boolean":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(value as boolean) || false}
              onChange={(e) => handleChange(field.name, e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm">{field.label}</span>
          </label>
        );
      case "textarea":
        return (
          <textarea
            value={(value as string) || ""}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            rows={6}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
          />
        );
      case "custom":
        return field.render?.(value, (v) => handleChange(field.name, v)) ?? null;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">Configure {definition.label}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("style")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "style"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Paintbrush className="h-4 w-4" />
            Style
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            {activeTab === "settings" && (
              <>
                {/* Config fields */}
                {definition.configSchema.length > 0 ? (
                  definition.configSchema.map((field) => (
                    <div key={field.name} className="space-y-1">
                      {field.type !== "boolean" && (
                        <label className="text-sm font-medium">{field.label}</label>
                      )}
                      {renderField(field)}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No settings for this panel.</p>
                )}
              </>
            )}

            {activeTab === "style" && (
              <StyleTab
                style={style}
                onChange={handleStyleChange}
                defaultLabel={definition.label}
                visibility={visibility}
                onVisibilityChange={setVisibility}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Style Tab ---

function StyleTab({
  style,
  onChange,
  defaultLabel,
  visibility,
  onVisibilityChange,
}: {
  style: PanelStyle;
  onChange: <K extends keyof PanelStyle>(key: K, value: PanelStyle[K]) => void;
  defaultLabel: string;
  visibility: DeviceVisibility;
  onVisibilityChange: (v: DeviceVisibility) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Device Visibility */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visibility</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onVisibilityChange("all")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              visibility === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <Globe className="h-4 w-4" />
            All
          </button>
          <button
            type="button"
            onClick={() => onVisibilityChange("desktop")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              visibility === "desktop"
                ? "border-blue-400 bg-blue-400/10 text-blue-400"
                : "border-border hover:bg-muted"
            }`}
          >
            <Monitor className="h-4 w-4" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => onVisibilityChange("mobile")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              visibility === "mobile"
                ? "border-green-400 bg-green-400/10 text-green-400"
                : "border-border hover:bg-muted"
            }`}
          >
            <Smartphone className="h-4 w-4" />
            Mobile
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose which devices can see this panel
        </p>
      </div>

      <div className="border-t border-border" />

      {/* Panel Header */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Header</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">Panel Name</label>
          <input
            type="text"
            value={style.panelName}
            onChange={(e) => onChange("panelName", e.target.value)}
            placeholder={defaultLabel}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use the default name
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={style.showHeader}
            onChange={(e) => onChange("showHeader", e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Show panel header</span>
        </label>
      </div>

      <div className="border-t border-border" />

      {/* Background */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Background</h3>
        <div className="flex gap-2">
          {(["inherit", "transparent", "custom"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange("background", opt)}
              className={`flex-1 px-3 py-2 rounded-md border text-sm capitalize transition-colors ${
                style.background === opt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {style.background === "custom" && (
          <RGBAColorPicker
            value={style.backgroundColor}
            onChange={(v) => onChange("backgroundColor", v)}
          />
        )}
      </div>

    </div>
  );
}

// --- RGBA Color Picker ---

function parseRGBA(rgba: string): { r: number; g: number; b: number; a: number } {
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 0.5 };
}

function toRGBA(c: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

function toHex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function fromHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function RGBAColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const color = parseRGBA(value);

  const handleHexChange = (hex: string) => {
    const parsed = fromHex(hex);
    if (parsed) {
      onChange(toRGBA({ ...parsed, a: color.a }));
    }
  };

  const handleAlphaChange = (a: number) => {
    onChange(toRGBA({ ...color, a }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Color swatch + native picker */}
        <label className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-md border border-input cursor-pointer"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={toHex(color)}
            onChange={(e) => handleHexChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
        {/* Hex input */}
        <input
          type="text"
          value={toHex(color)}
          onChange={(e) => handleHexChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
          placeholder="#000000"
        />
      </div>
      {/* Alpha slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Opacity</label>
          <span className="text-xs text-muted-foreground font-mono">{Math.round(color.a * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={color.a}
          onChange={(e) => handleAlphaChange(parseFloat(e.target.value))}
          className="w-full accent-primary"
        />
      </div>
      {/* Preview */}
      <div className="text-xs text-muted-foreground font-mono">{value}</div>
    </div>
  );
}
