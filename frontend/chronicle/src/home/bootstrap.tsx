import { createContext, useContext } from "react";
import { useLocation } from "react-router-dom";

/** Only public, stable homepage inputs. Live configuration and auth still load normally. */
export interface HomeBootstrap {
  productName: string;
  foreverLanding: boolean;
  uploadsDisabled: boolean;
}
export const HomeBootstrapContext = createContext<HomeBootstrap | null>(null);
export function useHomeBootstrap() {
  const bootstrap = useContext(HomeBootstrapContext);
  return useLocation().pathname === "/" ? bootstrap : null;
}
