import type { ArmoryPlayer } from "./types";
import { getClassColorVar } from "./types";

interface CharacterHeaderProps {
  player: ArmoryPlayer;
}

function getRaceIconUrl(race: string): string {
  // Race icons follow the same pattern as class icons.
  // TODO: Add race icon PNGs to public/c/icons/race_*.png
  const name = race.toLowerCase().replace(" ", "");
  return `/c/icons/race_${name}.png`;
}

function getClassIconUrl(cls: string): string {
  return `/c/icons/class_${cls.toLowerCase()}.png`;
}

export function CharacterHeader({ player }: CharacterHeaderProps) {
  const classColor = getClassColorVar(player.class);
  const updatedDate = new Date(player.updated_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const classLabel = player.class.charAt(0) + player.class.slice(1).toLowerCase();
  const raceLabel = player.race === "NightElf" ? "Night Elf" : player.race === "BloodElf" ? "Blood Elf" : player.race;

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
          src={getRaceIconUrl(player.race)}
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
          &lt;{player.guild_name}&gt;
        </p>
      )}

      {/* Race, class, realm */}
      <p className="text-xs text-zinc-500">
        {raceLabel} {classLabel} · {player.realm_name}
      </p>

      {/* Last updated */}
      <p className="text-2xs text-zinc-600">
        Last seen {updatedDate}
      </p>
    </div>
  );
}
