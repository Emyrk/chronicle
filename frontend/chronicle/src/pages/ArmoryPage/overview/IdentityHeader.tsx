import { Link } from "react-router-dom";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { formatClassLabel, formatRaceLabel, getClassIconUrl, getRaceIconUrl } from "../characterDisplay";
import { getClassColorVar } from "../types";
import { treeName } from "./util";

interface IdentityHeaderProps {
  player: ArmoryPlayer;
  /** Rendered below the identity meta line (e.g. the mode selector). */
  actions?: React.ReactNode;
  /** The score / journey stats card rendered to the right of the identity. */
  children?: React.ReactNode;
}

/**
 * Design-style overview header: identity on the left, headline stats card
 * bottom-aligned on the right.
 */
export function IdentityHeader({ player, actions, children }: IdentityHeaderProps) {
  const iconBaseUrl = useIconBaseUrl();
  const classColor = getClassColorVar(player.class);

  const trees = player.talents?.trees;
  const deepestIdx = trees
    ? trees.reduce((best, t, i) => (t.points_spent > trees[best].points_spent ? i : best), 0)
    : -1;
  const specLabel =
    deepestIdx >= 0 && trees![deepestIdx].points_spent > 0
      ? `${treeName(player, deepestIdx)} `
      : `${formatRaceLabel(player.race)} `;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          <img
            src={getRaceIconUrl(player.race, player.gender, iconBaseUrl)}
            alt={formatRaceLabel(player.race)}
            title={formatRaceLabel(player.race)}
            className="size-12 rounded border border-border bg-popover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <img
            src={getClassIconUrl(player.class)}
            alt={formatClassLabel(player.class)}
            title={formatClassLabel(player.class)}
            className="size-12 rounded border border-border bg-popover"
          />
        </div>
        <div className="min-w-0">
          <div
            className="font-wow truncate text-4xl leading-none"
            style={{ color: classColor }}
          >
            {player.name}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {player.guild_name && (
              <>
                &lt;
                {player.guild_id ? (
                  <Link
                    to={`/g/${player.guild_id}`}
                    style={{ color: "var(--color-amber-500)" }}
                    className="hover:underline"
                  >
                    {player.guild_name}
                  </Link>
                ) : (
                  player.guild_name
                )}
                &gt;{" · "}
              </>
            )}
            {player.level > 0 && <>Level {player.level} </>}
            {specLabel}
            {formatClassLabel(player.class)} · {player.realm_name}
          </div>
          {actions && <div className="mt-3">{actions}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
