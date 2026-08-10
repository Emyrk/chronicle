import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/gear", label: "Gear Lists", end: true },
  { to: "/gear/weights", label: "Analysis Profiles", end: false },
  { to: "/gear/progression", label: "Progression", end: false },
  { to: "/gear/trends", label: "Trends", end: false },
];

export function GearLayout() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-6 border-b border-gray-700/50 pb-3">
        <h1 className="font-wow text-lg text-amber-100/90 mr-2">Gear</h1>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "text-sm pb-2 -mb-3 border-b-2 transition-colors",
                isActive
                  ? "text-white border-blue-500"
                  : "text-gray-400 border-transparent hover:text-gray-200",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
