import { createContext, useContext, type ReactNode } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePortalContainer(): HTMLElement | null {
  const container = useContext(PortalContainerContext);
  if (container) return container;
  return typeof document === "undefined" ? null : document.body;
}
