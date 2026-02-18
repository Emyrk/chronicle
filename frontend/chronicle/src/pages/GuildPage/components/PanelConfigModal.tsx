import { useState } from "react";
import type { GuildPagePanel, DeviceVisibility } from "@/api/typesGenerated";
import { getPanelDefinition } from "../panels/registry";
import type { ConfigField } from "../panels/types";
import { X, Monitor, Smartphone, Globe } from "lucide-react";

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

interface InnerProps {
  panel: GuildPagePanel;
  definition: NonNullable<ReturnType<typeof getPanelDefinition>>;
  onSave: (config: Record<string, unknown>, visibility: DeviceVisibility) => void;
  onClose: () => void;
}

function PanelConfigModalInner({ panel, definition, onSave, onClose }: InnerProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(panel.config || {});
  const [visibility, setVisibility] = useState<DeviceVisibility>(panel.visibility || "all");

  const handleChange = (name: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config, visibility);
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
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            {/* Visibility setting */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Device Visibility</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("all")}
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
                  onClick={() => setVisibility("desktop")}
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
                  onClick={() => setVisibility("mobile")}
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

            {/* Separator if there are config fields */}
            {definition.configSchema.length > 0 && (
              <div className="border-t border-border" />
            )}

            {/* Config fields */}
            {definition.configSchema.map((field) => (
              <div key={field.name} className="space-y-1">
                {field.type !== "boolean" && (
                  <label className="text-sm font-medium">{field.label}</label>
                )}
                {renderField(field)}
              </div>
            ))}
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
