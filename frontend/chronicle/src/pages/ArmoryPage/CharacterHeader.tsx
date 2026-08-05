import { Link } from "react-router-dom";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { formatClassLabel, formatRaceLabel, getClassIconUrl, getRaceIconUrl } from "./characterDisplay";
import { getClassColorVar } from "./types";

interface CharacterHeaderProps {
  player: ArmoryPlayer;
}

export function CharacterHeader({ player }: CharacterHeaderProps) {
  const iconBaseUrl = useIconBaseUrl();
  const classColor = getClassColorVar(player.class);
  const updatedDate = new Date(player.updated_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const classLabel = formatClassLabel(player.class);
  const raceLabel = formatRaceLabel(player.race);

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Class-colored top bar */}
      <div
        className="w-full h-1 rounded-full mb-2"
        style={{ backgroundColor: classColor }}
      />

      {/* Race icon — Name — Class icon */}
      <div className="flex items-center gap-3">
        <img
          src={getRaceIconUrl(player.race, player.gender, iconBaseUrl)}
          alt={raceLabel}
          className="w-8 h-8 rounded"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ color: classColor }}
        >
          {player.name}
        </h1>
        <img
          src={getClassIconUrl(player.class)}
          alt={classLabel}
          className="w-8 h-8 rounded"
        />
      </div>

      {/* Guild name */}
      {player.guild_name && (
        <p className="text-sm text-zinc-400">
          &lt;{player.guild_id ? (
            <Link to={`/g/${player.guild_id}`} className="hover:text-zinc-200 transition-colors">
              {player.guild_name}
            </Link>
          ) : player.guild_name}&gt;
        </p>
      )}

      {/* Race, class, realm */}
      <p className="text-xs text-zinc-500">
        {player.level > 0 && <>Level {player.level} </>}{raceLabel} {classLabel} · {player.realm_name}
      </p>

      {/* Last updated */}
      {player.updated_from_instance ? (
        <Link
          to={`/instances/${player.updated_from_instance}`}
          className="text-2xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Last seen {updatedDate} ↗
        </Link>
      ) : (
        <p className="text-2xs text-zinc-600">
          Last seen {updatedDate}
        </p>
      )}
    </div>
  );
}
