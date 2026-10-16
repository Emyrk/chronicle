/* eslint-disable react-refresh/only-export-components -- Provider, hooks, and registry helpers share one context. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface InstanceKeybind {
  keys: string;
  action: string;
}

export interface InstanceKeybindGroup {
  id: string;
  label: string;
  keybinds: readonly InstanceKeybind[];
}

interface InstanceKeybindRegistry {
  groups: readonly InstanceKeybindGroup[];
  register: (group: InstanceKeybindGroup) => () => void;
}

const NO_KEYBIND_GROUPS: readonly InstanceKeybindGroup[] = [];
const InstanceKeybindContext = createContext<InstanceKeybindRegistry | null>(null);

function sameGroup(a: InstanceKeybindGroup | undefined, b: InstanceKeybindGroup): boolean {
  if (!a || a.label !== b.label || a.keybinds.length !== b.keybinds.length) return false;
  return a.keybinds.every((keybind, index) => {
    const candidate = b.keybinds[index];
    return keybind.keys === candidate?.keys && keybind.action === candidate.action;
  });
}

export function setInstanceKeybindGroup(
  current: ReadonlyMap<string, InstanceKeybindGroup>,
  group: InstanceKeybindGroup,
): ReadonlyMap<string, InstanceKeybindGroup> {
  if (sameGroup(current.get(group.id), group)) return current;
  const next = new Map(current);
  next.set(group.id, group);
  return next;
}

export function removeInstanceKeybindGroup(
  current: ReadonlyMap<string, InstanceKeybindGroup>,
  id: string,
): ReadonlyMap<string, InstanceKeybindGroup> {
  if (!current.has(id)) return current;
  const next = new Map(current);
  next.delete(id);
  return next;
}

function keybindIdentity(keybind: InstanceKeybind): string {
  return JSON.stringify([keybind.keys, keybind.action]);
}

/** Collapses identical shortcuts from multiple mounted panels into one Panels section. */
export function collapseInstanceKeybindGroups(
  groups: readonly InstanceKeybindGroup[],
): readonly InstanceKeybindGroup[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const keybind of group.keybinds) {
      const identity = keybindIdentity(keybind);
      counts.set(identity, (counts.get(identity) ?? 0) + 1);
    }
  }

  const shared: InstanceKeybind[] = [];
  const sharedSeen = new Set<string>();
  const uniqueGroups: InstanceKeybindGroup[] = [];

  for (const group of groups) {
    const unique: InstanceKeybind[] = [];
    for (const keybind of group.keybinds) {
      const identity = keybindIdentity(keybind);
      if ((counts.get(identity) ?? 0) > 1) {
        if (!sharedSeen.has(identity)) {
          sharedSeen.add(identity);
          shared.push(keybind);
        }
      } else {
        unique.push(keybind);
      }
    }
    if (unique.length > 0) uniqueGroups.push({ ...group, keybinds: unique });
  }

  return shared.length > 0
    ? [{ id: "shared-panel-keybinds", label: "Panels", keybinds: shared }, ...uniqueGroups]
    : uniqueGroups;
}

export function InstanceKeybindProvider({ children }: { children: ReactNode }) {
  const parent = useContext(InstanceKeybindContext);
  if (parent) return children;
  return <InstanceKeybindRegistryProvider>{children}</InstanceKeybindRegistryProvider>;
}

function InstanceKeybindRegistryProvider({ children }: { children: ReactNode }) {
  const [groupsByID, setGroupsByID] = useState<ReadonlyMap<string, InstanceKeybindGroup>>(
    () => new Map(),
  );

  const register = useCallback((group: InstanceKeybindGroup) => {
    setGroupsByID((current) => setInstanceKeybindGroup(current, group));
    return () => setGroupsByID((current) => removeInstanceKeybindGroup(current, group.id));
  }, []);

  const value = useMemo<InstanceKeybindRegistry>(() => ({
    groups: [...groupsByID.values()].filter((group) => group.keybinds.length > 0),
    register,
  }), [groupsByID, register]);

  return (
    <InstanceKeybindContext.Provider value={value}>
      {children}
    </InstanceKeybindContext.Provider>
  );
}

export function useInstanceKeybindGroups(): readonly InstanceKeybindGroup[] {
  const groups = useContext(InstanceKeybindContext)?.groups ?? NO_KEYBIND_GROUPS;
  return useMemo(() => collapseInstanceKeybindGroups(groups), [groups]);
}

/**
 * Reports shortcuts to the instance page's shared keybind list. Components with
 * configurable or state-dependent shortcuts should memoize `keybinds` before
 * passing them here. The registration disappears automatically on unmount.
 */
export function useRegisterInstanceKeybinds(
  id: string,
  label: string,
  keybinds: readonly InstanceKeybind[],
  enabled = true,
): void {
  const register = useContext(InstanceKeybindContext)?.register;

  useEffect(() => {
    if (!register || !enabled || keybinds.length === 0) return;
    return register({ id, label, keybinds });
  }, [enabled, id, keybinds, label, register]);
}
