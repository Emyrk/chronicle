import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/wowdb/items", label: "Items" },
  { to: "/wowdb/spells", label: "Spells" },
  { to: "/wowdb/creatures", label: "Creatures" },
  { to: "/wowdb/sets", label: "Item Sets" },
];

export function WoWDBLayout() {
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-6 border-b border-gray-700/50 pb-3">
        <h1 className="text-lg font-bold text-white mr-2">WoW Database</h1>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "text-sm pb-2 -mb-3 border-b-2 transition-colors",
                isActive
                  ? "text-white border-blue-500"
                  : "text-gray-400 border-transparent hover:text-gray-200"
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
