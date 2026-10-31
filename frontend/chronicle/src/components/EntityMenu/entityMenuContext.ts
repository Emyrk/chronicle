import { createContext, useContext, useEffect } from "react";
import type { EntityRef } from "./entity";
import type { EntityAction } from "./EntityMenu";

/** Contributes actions for entities clicked inside a scope, e.g. "Focus" in a meter panel. */
export type EntityActionProvider = (entity: EntityRef) => EntityAction[];

/**
 * The raid a page is showing, so quick stats compare the same fights. Boss names only:
 * trash is never part of a ranked run.
 */
export interface EntityRaidContext {
  instanceId?: string;
  /** The log's slug, which guild clears are keyed by. */
  instanceSlug?: string;
  instanceName: string;
  difficultyName?: string;
  maxPlayers?: number;
  dynamicDifficulty?: number;
  bossNames: string[];
  /** How the page describes itself to things added to compare from it, e.g. "Naxxramas · <Guild> · Oct 28". */
  label?: string;
}

export interface EntityMenuContextValue {
  register: (id: string, provider: EntityActionProvider) => () => void;
  setRaid: (raid: EntityRaidContext | null) => void;
}

export const EntityMenuContext = createContext<EntityMenuContextValue | null>(null);

/** Tells quick stats which raid and fights this page is showing, while it is mounted. */
export function useEntityRaidContext(raid: EntityRaidContext | null) {
  const context = useContext(EntityMenuContext);
  const key = raid ? JSON.stringify(raid) : "";
  useEffect(() => {
    if (!context) return;
    context.setRaid(key ? (JSON.parse(key) as EntityRaidContext) : null);
    return () => context.setRaid(null);
  }, [context, key]);
}
