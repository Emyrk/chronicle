import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSupportedInstances } from "@/api/queries";
import { useTenantDatasetScope } from "@/hooks/useDatasetId";
import { fetchMapManifest } from "@/pages/Technical/mapManifest";
import { dungeonShelfCards } from "./dungeonShelf";

// Same heading font as StartPage.
const HEADING_FONT = "font-['Libre_Baskerville',Georgia,serif]";

export function DungeonShelf() {
  const { data: instances } = useSupportedInstances();
  const { iconBaseUrl } = useTenantDatasetScope();
  // Same query as the Map panel's manifest, so the two share one cached fetch.
  const { data: manifest } = useQuery({
    queryKey: ["wow-map-manifest", iconBaseUrl],
    enabled: Boolean(iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchMapManifest(iconBaseUrl!),
  });
  const cards = dungeonShelfCards(instances ?? [], manifest);

  return (
    <section id="dungeons" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-9 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className={`m-0 text-xl font-bold lg:text-2xl ${HEADING_FONT}`}>Real floors, not dots on a map</h2>
        <Link to="/supported" className="text-sm text-[#4fd1c5] hover:text-[#8ee6dd]">
          All supported instances
        </Link>
      </div>
      <ul className="styled-scrollbar m-0 flex list-none gap-3 overflow-x-auto p-0 pb-1.5">
        {cards.map((d) => (
          <li key={d.name} className="flex shrink-0 basis-[190px]">
            <Link
              to={`/recent?inst=${encodeURIComponent(d.name)}`}
              className={`flex w-full flex-col gap-1 rounded-[10px] border bg-[#141d30] p-3.5 text-[#e8eef8] no-underline hover:bg-[#1a2540] ${
                d.kind === "3d" ? "border-[#4fd1c5]" : "border-[#27324a]"
              }`}
            >
              <div className="font-semibold">{d.name}</div>
              <div
                className={`text-xs ${
                  d.kind === "3d" ? "text-[#8ee6dd]" : d.kind === "2d" ? "text-[#b7c2d6]" : "text-[#8a97ad]"
                }`}
              >
                {d.kind === "3d" ? "3D floor" : d.kind === "2d" ? "2D map" : "Coming"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
