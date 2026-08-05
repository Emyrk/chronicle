import { Flag, ExternalLink } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface RecruitmentConfig {
  needs: string;
  note: string;
  applyUrl: string;
  applyLabel: string;
}

interface RecruitmentNeed {
  spec: string;
  status: string;
  color: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-muted-foreground",
  always: "text-emerald-400",
  closed: "text-muted-foreground/60",
};

const PRIORITY_DOTS: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-muted-foreground",
  always: "bg-emerald-400",
  closed: "bg-muted-foreground/60",
};

/**
 * Parses one need per line. Each line is "Spec: priority", e.g.
 * "Resto Druid: High". Priority is one of high/medium/low/always/closed;
 * anything else (or no priority) shows verbatim in a neutral color.
 */
function parseNeeds(raw: string): RecruitmentNeed[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.lastIndexOf(":");
      const spec = sep >= 0 ? line.slice(0, sep).trim() : line;
      const status = sep >= 0 ? line.slice(sep + 1).trim() : "Open";
      const key = status.toLowerCase();
      return {
        spec: spec || line,
        status,
        color: key,
      };
    });
}

function RecruitmentContent({ config, isEditing }: GuildPanelRenderProps<RecruitmentConfig>) {
  const needs = parseNeeds(config.needs || "");
  const note = config.note || "";
  const applyUrl = config.applyUrl || "";

  if (needs.length === 0 && !note) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm text-center px-4">
          {isEditing
            ? "Open this panel's settings to list the specs you need (one per line, e.g. “Resto Druid: High”)."
            : "No recruitment info yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-1">
      {needs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {needs.map((need, i) => (
            <div key={`${need.spec}-${i}`} className="flex items-center gap-2.5">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOTS[need.color] ?? "bg-primary"}`}
              />
              <span className="flex-1 truncate text-sm">{need.spec}</span>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${PRIORITY_COLORS[need.color] ?? "text-primary"}`}
              >
                {need.status}
              </span>
            </div>
          ))}
        </div>
      )}
      {note && (
        <p
          className={`text-xs leading-relaxed text-muted-foreground whitespace-pre-line ${
            needs.length > 0 ? "mt-3 border-t border-border/40 pt-3" : ""
          }`}
        >
          {note}
        </p>
      )}
      {applyUrl && (
        <a
          href={applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          {config.applyLabel || "Apply"}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export const RecruitmentPanel: GuildPanelDefinition<RecruitmentConfig> = {
  type: "recruitment",
  label: "Recruitment",
  icon: <Flag className="h-4 w-4" />,
  description: "The specs your guild is recruiting, with priorities and how to apply",
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 8 },
  configSchema: [
    {
      name: "needs",
      label: "Needs (one per line: “Spec: priority” — high, medium, low, always, or closed)",
      type: "textarea",
      placeholder: "Resto Druid: High\nWarlock: Medium\nProt Warrior: Low\nExceptional players: Always",
    },
    {
      name: "note",
      label: "Note (raid times, loot rules, etc.)",
      type: "textarea",
      placeholder: "Tue / Thu / Sun, 8–11pm server. Consumables provided.",
    },
    {
      name: "applyUrl",
      label: "Apply link (Discord invite, form, etc.)",
      type: "text",
      placeholder: "https://discord.gg/...",
    },
    {
      name: "applyLabel",
      label: "Apply link label",
      type: "text",
      placeholder: "Apply in Discord",
    },
  ],
  defaultConfig: {
    needs: "",
    note: "",
    applyUrl: "",
    applyLabel: "",
  },
  render: (props) => <RecruitmentContent {...props} />,
};
