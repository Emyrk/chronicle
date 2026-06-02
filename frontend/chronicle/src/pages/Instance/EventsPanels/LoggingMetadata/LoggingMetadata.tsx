/**
 * Logging Metadata panel - Displays combat log recording metadata
 *
 * Shows addon versions, dependency versions, and the recording player
 * information extracted from the combat log header.
 */

import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { loggingMetadataProcessor, type LoggingMetadataResult } from "./loggingMetadata.processor";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";

/** Human-readable labels for version keys */
const VERSION_LABELS: Record<string, string> = {
  chronicle_companion: "Chronicle Companion",
  superwow: "SuperWoW",
  nampower: "NamePower",
  xp3: "XP3",
  wow_client: "WoW Client",
  wow_build: "WoW Build",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLoggingMetadataPanel(): PanelDefinition<LoggingMetadataResult, any> {
  return {
    ...loggingMetadataProcessor,
    label: "Logging Metadata",
    icon: <FileText className="h-4 w-4" />,
    supportsPerSecond: false,

    render: (props: PanelRenderProps<LoggingMetadataResult>) => {
      return <LoggingMetadataContent {...props} />;
    },
  };
}

function LoggingMetadataContent({ context }: PanelRenderProps<LoggingMetadataResult>) {
  const { instance } = context;
  const versions = instance.versions ?? {};
  const hasVersions = Object.keys(versions).length > 0;
  const hasRecorder = !!instance.recorderName || !!instance.recorderGuid;
  const flavor = instance.flavor ?? [];
  const hasSource = !!instance.format || flavor.length > 0;

  if (!hasVersions && !hasRecorder && !hasSource) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No logging metadata available for this instance.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-2 py-2 text-sm">
      {hasSource && (
        <div>
          <h4 className="font-medium text-muted-foreground mb-1.5">Source</h4>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {instance.format && (
              <>
                <span className="text-muted-foreground">Format</span>
                <span className="font-mono text-xs">{instance.format}</span>
              </>
            )}
            {flavor.length > 0 && (
              <>
                <span className="text-muted-foreground">Flavor</span>
                <span className="flex flex-wrap gap-1">
                  {flavor.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {hasRecorder && (
        <div>
          <h4 className="font-medium text-muted-foreground mb-1.5">Recorded By</h4>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {instance.recorderName && (
              <>
                <span className="text-muted-foreground">Player</span>
                <span>
                  <RecorderPlayerName context={context} />
                </span>
              </>
            )}
            {instance.recorderGuid && (
              <>
                <span className="text-muted-foreground">GUID</span>
                <span className="font-mono text-xs">{instance.recorderGuid}</span>
              </>
            )}
          </div>
        </div>
      )}
      {hasVersions && (
        <div>
          <h4 className="font-medium text-muted-foreground mb-1.5">Versions</h4>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {Object.entries(versions).map(([key, value]) => (
              <div key={key} className="contents">
                <span className="text-muted-foreground">{VERSION_LABELS[key] ?? key}</span>
                <span className="font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import type { PanelContext } from "../types";

function RecorderPlayerName({ context }: { context: PanelContext }) {
  const { instance } = context;
  const guid = instance.recorderGuid;
  const name = instance.recorderName;
  if (!name) return null;

  const player = guid ? instance.players?.[guid] : undefined;
  const colorStyle = player?.class
    ? { color: getClassColorVar(player.class) }
    : undefined;
  const armoryUrl = guid ? getArmoryUrl(instance, guid) : undefined;

  if (armoryUrl) {
    return (
      <Link to={armoryUrl} className="font-medium hover:underline" style={colorStyle}>
        {name}
      </Link>
    );
  }

  return <span className="font-medium" style={colorStyle}>{name}</span>;
}
