import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { armoryUrl, entityAttributes, guildPageUrl, killTimeLeaderboardUrl, speedrunLeaderboardUrl, type EntityRef } from "./entity";

/**
 * A character or guild name that the entity menu can open (Alt+click). Characters are
 * class-colored. `link` makes it a normal link to the armory or guild page as well.
 */
export function EntityName({
  entity,
  link = false,
  newTab = false,
  className,
  style,
  children,
}: {
  entity: EntityRef;
  link?: boolean;
  newTab?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Defaults to the entity's name. */
  children?: ReactNode;
}) {
  const color = entity.kind === "character" && entity.className ? getClassColorVar(entity.className) : undefined;
  const props = {
    ...entityAttributes(entity),
    className: cn(link && "hover:underline", className),
    style: color ? { color, ...style } : style,
  };
  const content = children ?? entity.name;
  if (!link) return <span {...props}>{content}</span>;
  const to =
    entity.kind === "character"
      ? armoryUrl(entity)
      : entity.kind === "guild"
        ? guildPageUrl(entity)
        : entity.kind === "raid"
          ? speedrunLeaderboardUrl(entity.name, entity.difficultyName)
          : killTimeLeaderboardUrl(entity);
  return (
    <Link to={to} target={newTab ? "_blank" : undefined} {...props}>
      {content}
    </Link>
  );
}
