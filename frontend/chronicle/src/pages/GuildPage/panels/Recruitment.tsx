/* eslint-disable react-refresh/only-export-components -- Panel registry files export a definition alongside their render components. */
import { Flag, ExternalLink, Plus, X } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface RecruitmentNeedInput {
  spec: string;
  status: string;
}

interface RecruitmentConfig {
  /** Structured needs; older saves may hold a newline-separated string. */
  needs: RecruitmentNeedInput[] | string;
  note: string;
  applyUrl: string;
  applyLabel: string;
}

interface RecruitmentNeed extends RecruitmentNeedInput {
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

/** Accepts structured rows, or the legacy "Spec: priority" lines. */
function normalizeNeedInputs(raw: unknown): RecruitmentNeedInput[] {
  if (Array.isArray(raw)) {
    return raw.map((need) => ({
      spec: typeof need?.spec === "string" ? need.spec : "",
      status: typeof need?.status === "string" ? need.status : "",
    }));
  }
  if (typeof raw !== "string" || !raw) return [];

  return raw.split("\n").map((line) => {
    const sep = line.lastIndexOf(":");
    return {
      spec: (sep >= 0 ? line.slice(0, sep) : line).trim(),
      status: (sep >= 0 ? line.slice(sep + 1) : "Open").trim(),
    };
  });
}

function parseNeeds(raw: unknown): RecruitmentNeed[] {
  return normalizeNeedInputs(raw)
    .map(({ spec, status }) => ({
      spec: spec.trim(),
      status: status.trim(),
      color: status.trim().toLowerCase(),
    }))
    .filter((need) => need.spec.length > 0);
}

function RecruitmentNeedsEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const needs = normalizeNeedInputs(value);
  const rows =
    needs.length > 0 || Array.isArray(value) ? needs : [{ spec: "", status: "" }];

  const update = (index: number, patch: Partial<RecruitmentNeedInput>) => {
    onChange(rows.map((need, i) => (i === index ? { ...need, ...patch } : need)));
  };

  return (
    <div className="space-y-2">
      {rows.map((need, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={need.spec}
            onChange={(e) => update(i, { spec: e.target.value })}
            placeholder="Resto Druid"
            aria-label={`Recruitment need ${i + 1}`}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <span className="shrink-0 text-sm font-medium text-muted-foreground">:</span>
          <input
            type="text"
            value={need.status}
            onChange={(e) => update(i, { status: e.target.value })}
            placeholder="High"
            aria-label={`Recruitment priority ${i + 1}`}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Remove row"
            aria-label={`Remove recruitment need ${i + 1}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { spec: "", status: "" }])}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Add row
      </button>
      <p className="text-xs text-muted-foreground">
        Priorities like high, medium, low, always, and closed get their own colors.
      </p>
    </div>
  );
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
            ? "Open this panel's settings to add the specs and priorities you need."
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
      label: "Needs",
      type: "custom",
      render: (value, onChange) => <RecruitmentNeedsEditor value={value} onChange={onChange} />,
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
    needs: [{ spec: "", status: "" }],
    note: "",
    applyUrl: "",
    applyLabel: "",
  },
  render: (props) => <RecruitmentContent {...props} />,
};
