/* eslint-disable react-refresh/only-export-components */
import { BookMarked, ExternalLink, Plus, X } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";
import {
  normalizeTalentBuilds,
  talentBuildLinkDetails,
  talentClassLabel,
  type GuildTalentBuild,
} from "./TalentBuilds.utils";

interface TalentBuildsConfig {
  builds: GuildTalentBuild[];
}

const CLASS_ACCENTS: Record<string, string> = {
  warrior: "#c79c6e",
  paladin: "#f58cba",
  hunter: "#abd473",
  rogue: "#fff569",
  priest: "#f1f1f1",
  deathknight: "#c41f3b",
  shaman: "#0070de",
  mage: "#69ccf0",
  warlock: "#9482c9",
  druid: "#ff7d0a",
  pet: "#abd473",
};

function TalentBuildsEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const builds = normalizeTalentBuilds(value);

  const update = (index: number, patch: Partial<GuildTalentBuild>) => {
    onChange(builds.map((build, buildIndex) => buildIndex === index ? { ...build, ...patch } : build));
  };

  return (
    <div className="space-y-2.5">
      {builds.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add links from Chronicle's talent builder to share your guild's recommended builds.
        </p>
      )}
      {builds.map((build, index) => {
        const link = talentBuildLinkDetails(build.url);
        return (
          <div key={index} className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-start gap-1.5">
              <input
                type="text"
                value={build.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Build name, e.g. Combustion"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => onChange(builds.filter((_, buildIndex) => buildIndex !== index))}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Remove build"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={build.url}
              onChange={(event) => update(index, { url: event.target.value })}
              placeholder="/talents/mage?build=..."
              aria-invalid={Boolean(build.url && !link)}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs aria-invalid:border-destructive"
            />
            {build.url && !link && (
              <p className="text-[11px] text-destructive">Paste a link to the Chronicle talent builder.</p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                value={build.specialization}
                onChange={(event) => update(index, { specialization: event.target.value })}
                placeholder="Spec label (optional)"
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={build.owner}
                onChange={(event) => update(index, { owner: event.target.value })}
                placeholder="Author (optional)"
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...builds, { name: "", owner: "", specialization: "", url: "" }])}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Add talent build
      </button>
    </div>
  );
}

function BuildPointsBar({ points, accent }: { points: number[]; accent: string }) {
  const total = points.reduce((sum, pointsInTree) => sum + pointsInTree, 0);
  if (total === 0) return null;

  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted/70" aria-hidden="true">
      {points.map((pointsInTree, index) => pointsInTree > 0 && (
        <span
          key={index}
          style={{
            width: `${(pointsInTree / total) * 100}%`,
            backgroundColor: accent,
            opacity: Math.max(0.35, 1 - index * 0.25),
          }}
        />
      ))}
    </div>
  );
}

function TalentBuildsContent({ config, position, isEditing }: GuildPanelRenderProps<TalentBuildsConfig>) {
  const builds = normalizeTalentBuilds(config.builds).filter((build) => talentBuildLinkDetails(build.url));

  if (builds.length === 0) {
    return (
      <div className="flex h-full min-h-[100px] items-center justify-center text-muted-foreground">
        <p className="px-4 text-center text-sm">
          {isEditing
            ? "Open this panel's settings to add links from the talent builder."
            : "No talent builds have been shared yet"}
        </p>
      </div>
    );
  }

  const columns = position.w >= 8 ? 2 : 1;

  return (
    <div
      className="grid content-start gap-3 p-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {builds.map((build, index) => {
        const link = talentBuildLinkDetails(build.url)!;
        const classLabel = talentClassLabel(link.classSlug);
        const accent = CLASS_ACCENTS[link.classSlug] ?? "var(--primary)";
        const name = build.name.trim() || `${classLabel} build`;
        const detail = build.specialization.trim() || classLabel;

        return (
          <a
            key={`${link.href}-${index}`}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={isEditing ? (event) => event.preventDefault() : undefined}
            aria-label={`Open ${name} in the talent builder`}
            className="group rounded-lg border border-border/60 bg-background/25 px-4 py-3.5 transition-colors hover:border-border hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="truncate font-wow text-lg font-semibold tracking-wide text-foreground">
                    {name}
                  </h3>
                  <span className="shrink-0 text-xs font-medium" style={{ color: accent }}>
                    {detail}
                  </span>
                </div>
                <BuildPointsBar points={link.points} accent={accent} />
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/35 pt-2.5 text-xs text-muted-foreground">
                  <span className="truncate">{build.owner.trim() || "Guild build"}</span>
                  {link.points.length > 0 && (
                    <span className="shrink-0 font-mono text-[11px]">
                      {link.points.join(" / ")}
                    </span>
                  )}
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground/70 transition-colors group-hover:text-foreground">
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export const TalentBuildsPanel: GuildPanelDefinition<TalentBuildsConfig> = {
  type: "talent_builds",
  label: "Talent Builds",
  icon: <BookMarked className="h-4 w-4" />,
  description: "Showcase recommended builds with links to the talent builder",
  defaultSize: { w: 8, h: 4 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "builds",
      label: "Builds",
      type: "custom",
      render: (value, onChange) => <TalentBuildsEditor value={value} onChange={onChange} />,
    },
  ],
  defaultConfig: {
    builds: [],
  },
  render: (props) => <TalentBuildsContent {...props} />,
};
