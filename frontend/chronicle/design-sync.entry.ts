// design-sync bundle entry (claude.ai/design sync).
// This app has no library build, so the sync bundles straight from source:
// every storybook-covered component (plus its compound siblings) is
// re-exported here and compiled by esbuild into window.Chronicle.
// Outside src/ on purpose — the app's tsc build (include: ["src"]) never sees it.
export * from "./design-sync.provider";
// Router primitives ride the bundle so stories and components share ONE
// react-router copy (context identity), and so design-time nav composition
// has Link/NavLink available.
export {
  MemoryRouter,
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Outlet,
  Navigate,
} from "react-router-dom";
export * from "./src/components/ui/button";
export * from "./src/components/ui/input";
export * from "./src/components/ui/label";
export * from "./src/components/ui/sheet";
export * from "./src/components/ui/tabs";
export * from "./src/components/ui/Alert/Alert";
export * from "./src/components/ui/Card/Card";
export * from "./src/components/ui/Checkbox/Checkbox";
export * from "./src/components/ui/Collapsible/Collapsible";
export * from "./src/components/ui/DropdownMenu/DropdownMenu";
export * from "./src/components/ui/ItemIcon/ItemIcon";
export * from "./src/components/ui/NavigationMenu/navigation-menu";
export * from "./src/components/ui/PlayerMetricChart/PlayerMetricChart";
export * from "./src/components/ui/ScrollArea/ScrollArea";
export * from "./src/components/ui/Sonner/Sonner";
export * from "./src/components/ui/Switch/Switch";
export * from "./src/components/ui/Tooltip/tooltip";
export * from "./src/components/Table/Table";
export * from "./src/components/NavBar/NavBar";
export * from "./src/components/Layout/Layout";
export * from "./src/pages/Recent/RaidCard";
export * from "./src/pages/Recent/RecentRaids";
export * from "./src/pages/Login/Login";
export * from "./src/pages/Logs/LogsList";
export * from "./src/pages/Logs/LogDetail";
export * from "./src/pages/Leaderboard/Podium";
export * from "./src/pages/Upload/Upload";
export * from "./src/pages/WoWDB/SpellTooltip";
export * from "./src/pages/Gear/progression/builder/LevelingScrubber";
export * from "./src/pages/Gear/progression/builder/StageScrubber";
export * from "./src/pages/Gear/progression/builder/DerivedSlotGrid";
export * from "./src/pages/Instance/TenantGate";
export * from "./src/pages/Instance/EventsPanels/EventsPanel";
// EventsPanel reads this context; exporting it lets preview fixtures (and
// design-time data providers) share the bundle's context instance.
export * from "./src/hooks/instanceEvents";
