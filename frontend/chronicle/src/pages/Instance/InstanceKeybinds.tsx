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
  return useContext(InstanceKeybindContext)?.groups ?? [];
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
