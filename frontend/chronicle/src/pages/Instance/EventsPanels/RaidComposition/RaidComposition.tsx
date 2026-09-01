/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated render components are intentional. */
import { useEffect, useState } from "react";
import { ChevronLeft, UsersRound } from "lucide-react";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import { GenericPanel } from "../GenericPanel";
import type { RaidGroupProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  raidCompositionProcessor,
  type RaidCompositionResult,
} from "./raidComposition.processor";

const REQUIRED_CAPABILITY = "raidgroup";

function playerIconUrl(className: string, specializationIconUrl?: string): string {
  if (specializationIconUrl) return specializationIconUrl;
  return `/c/icons/class_${className.toLowerCase()}.png`;
}

function PlayerIcon({
  className,
  specializationIconUrl,
}: {
  className: string;
  specializationIconUrl?: string;
}) {
  return (
    <img
      src={playerIconUrl(className, specializationIconUrl)}
      alt=""
      className="size-6 shrink-0 rounded border border-border/70 bg-black/40 object-cover"
      onError={(event) => {
        const image = event.currentTarget;
        const classIcon = `/c/icons/class_${className.toLowerCase()}.png`;
        image.src = image.src.endsWith(classIcon) ? "/c/icons/class_unknown.png" : classIcon;
      }}
    />
  );
}

function EmptySlot({ compact }: { compact: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        compact
          ? "size-6 shrink-0 rounded border border-dashed border-border/70 bg-background/20"
          : "h-8 w-28 rounded border border-dashed border-border/60 bg-background/15"
      }
    />
  );
}

function PlayerSlot({
  className,
  name,
  specializationName,
  specializationIconUrl,
  compact,
}: {
  className: string;
  name: string;
  specializationName?: string;
  specializationIconUrl?: string;
  compact: boolean;
}) {
  const classColor = CLASS_CSS_VAR[className] ?? CLASS_CSS_VAR.UNKNOWN;
  const classLabel = CLASS_DISPLAY[className] ?? className;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            compact
              ? "inline-flex size-6 shrink-0"
              : "flex h-8 w-28 min-w-0 items-center gap-1.5 rounded border border-border/60 bg-background/30 px-1.5 transition-colors group-hover:border-border"
          }
        >
          <PlayerIcon
            className={className}
            specializationIconUrl={specializationIconUrl}
          />
          {!compact && (
            <span
              className="min-w-0 truncate text-xs font-medium"
              style={{ color: classColor }}
            >
              {name}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        hideArrow
        className="min-w-44 border border-border bg-popover px-3 py-2 text-popover-foreground shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <PlayerIcon
            className={className}
            specializationIconUrl={specializationIconUrl}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" style={{ color: classColor }}>
              {name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{classLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{specializationName ?? "Unknown spec"}</span>
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function RaidCompositionContent(props: PanelRenderProps<RaidCompositionResult>) {
  const { context, result } = props;
  const encounterSelectionKey = context.selectedEncounterIds.join("\0");
  const [selectedGroupState, setSelectedGroupState] = useState<{
    index: number;
    encounterSelectionKey: string;
  } | null>(null);
  const selectedGroup = selectedGroupState?.encounterSelectionKey === encounterSelectionKey
    ? selectedGroupState.index
    : null;
  const specializations = usePlayerSpecializations();
  const players = context.instance.players ?? {};
  const supported = context.instance.capabilities.includes(REQUIRED_CAPABILITY);
  const compact = props.checkboxChecked;

  useEffect(() => {
    if (selectedGroup === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedGroupState(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedGroup]);

  if (!supported) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Raid composition is not available for this log. It requires raid-group messages from the companion addon. Try updating your addon if this is missing.
      </div>
    );
  }

  return (
    <GenericPanel {...props}>
      <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {result.encounterID === null ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No raid composition was reported for the selected encounters.
          </div>
        ) : selectedGroup === null ? (
          <div className="flex w-full min-w-0 flex-col gap-1 py-1">
            {result.groups.map((group, groupIndex) => {
              const filledSlots = group.filter(Boolean).length;
              return (
                <button
                  key={groupIndex}
                  type="button"
                  onClick={() => setSelectedGroupState({ index: groupIndex, encounterSelectionKey })}
                  className="group inline-grid w-fit max-w-full self-start grid-cols-[3.75rem_auto] items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition-colors hover:border-border hover:bg-accent/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Open Group ${groupIndex + 1}, ${filledSlots} of 5 slots filled`}
                >
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    Group {groupIndex + 1}
                  </span>
                  <span
                    className={
                      compact
                        ? "flex min-w-0 items-center gap-1.5"
                        : "grid grid-cols-[repeat(5,7rem)] gap-1.5"
                    }
                  >
                    {group.map((guid, slotIndex) => {
                      if (!guid) return <EmptySlot key={slotIndex} compact={compact} />;
                      const player = players[guid];
                      const specialization = specializations.get(guid);
                      return (
                        <PlayerSlot
                          key={`${guid}-${slotIndex}`}
                          className={player?.class ?? "UNKNOWN"}
                          name={player?.name ?? "Unknown"}
                          specializationName={specialization?.name}
                          specializationIconUrl={specialization?.iconUrl}
                          compact={compact}
                        />
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="w-full py-1">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedGroupState(null)}
                className="inline-flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ChevronLeft className="size-4" />
                Back
              </button>
              <h3 className="text-base font-semibold text-foreground">
                Group {selectedGroup + 1}
              </h3>
            </div>

            <div className="flex flex-col gap-2.5">
              {result.groups[selectedGroup].filter(Boolean).map((guid) => {
                const player = players[guid];
                const specialization = specializations.get(guid);
                const className = player?.class ?? "UNKNOWN";
                return (
                  <div key={guid} className="flex min-w-0 items-center gap-2.5">
                    <PlayerIcon
                      className={className}
                      specializationIconUrl={specialization?.iconUrl}
                    />
                    <span
                      className="min-w-0 truncate text-sm font-medium"
                      style={{ color: CLASS_CSS_VAR[className] ?? CLASS_CSS_VAR.UNKNOWN }}
                    >
                      {player?.name ?? guid}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {specialization?.name ?? "Unknown spec"}
                    </span>
                  </div>
                );
              })}
              {!result.groups[selectedGroup].some(Boolean) && (
                <p className="text-sm text-muted-foreground">This group is empty.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </GenericPanel>
  );
}

export function createRaidCompositionPanel(): PanelDefinition<
  RaidCompositionResult,
  RaidGroupProcessorEvent
> {
  return {
    ...raidCompositionProcessor,
    label: "Raid Composition",
    icon: <UsersRound className="size-4" />,
    syncDataMode: "full",
    requiredCapabilities: [REQUIRED_CAPABILITY],
    checkboxLabel: "Compact",
    renderOnlyOptionTokens: ["cb"],
    render: (props) => <RaidCompositionContent {...props} />,
  };
}
